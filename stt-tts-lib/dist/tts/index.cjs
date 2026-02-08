'use strict';

var piperTts = require('@realtimex/piper-tts-web');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var piperTts__namespace = /*#__PURE__*/_interopNamespace(piperTts);

// src/tts/prepare-piper-voice.ts
function preparePiperVoice(config) {
  const modelPath = config.modelPath ?? `voices/${config.voiceId}.onnx`;
  return {
    voiceId: config.voiceId,
    modelPath,
    sampleRate: config.sampleRate ?? 22050,
    inference: {
      lengthScale: config.lengthScale ?? 1,
      noiseScale: config.noiseScale ?? 0.667
    },
    metadata: {
      speaker: config.speaker ?? "default"
    }
  };
}

// src/tts/stream-tokens-to-speech.ts
function isAsyncIterable(value) {
  return typeof value[Symbol.asyncIterator] === "function";
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function streamTokensToSpeech(tokens, options = {}) {
  const chunkSize = options.chunkSize ?? 40;
  const delayMs = options.delayMs ?? 0;
  let buffer = "";
  let chunksEmitted = 0;
  let characters = 0;
  const emit = async () => {
    if (!buffer) return;
    characters += buffer.length;
    chunksEmitted += 1;
    if (options.onChunk) {
      await options.onChunk(buffer);
    }
    buffer = "";
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  };
  if (isAsyncIterable(tokens)) {
    for await (const token of tokens) {
      buffer += token;
      if (buffer.length >= chunkSize) {
        await emit();
      }
    }
  } else {
    for (const token of tokens) {
      buffer += token;
      if (buffer.length >= chunkSize) {
        await emit();
      }
    }
  }
  if (buffer) {
    await emit();
  }
  return { chunksEmitted, characters };
}

// src/tts/ort-setup.ts
async function createOrtEnvironment(config = {}) {
  const providers = config.providers ?? (config.device === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]);
  const environment = {
    device: config.device ?? "cpu",
    logLevel: config.logLevel ?? "warning",
    providers,
    initialized: false,
    async init() {
      this.initialized = true;
    }
  };
  await environment.init();
  return environment;
}

// src/tts/piper.ts
var voiceCache = /* @__PURE__ */ new Map();
var ortEnv = null;
async function ensureOrtReady(config = {}) {
  if (ortEnv) return ortEnv;
  ortEnv = await createOrtEnvironment(config);
  return ortEnv;
}
async function ensureVoiceLoaded(config) {
  const cached = voiceCache.get(config.voiceId);
  if (cached) return cached;
  const voice = preparePiperVoice(config);
  voiceCache.set(config.voiceId, voice);
  return voice;
}
async function warmupPiper(voiceConfig, synth, text = "warmup") {
  const voice = await ensureVoiceLoaded(voiceConfig);
  await synth(text, voice);
}
function resetVoiceCache() {
  voiceCache.clear();
}
function getBackendLabel(device) {
  if (!device) return "auto";
  return device === "webgpu" ? "WebGPU" : "CPU";
}
function isCorruptModelError(error) {
  if (!error) return false;
  const msg = typeof error === "string" ? error : error.message;
  if (!msg) return false;
  return /corrupt|checksum|integrity/i.test(msg);
}
async function* synthesizerWorker(textQueue, voiceConfig, synth) {
  const voice = await ensureVoiceLoaded(voiceConfig);
  for await (const text of textQueue) {
    yield synth(text, voice);
  }
}
async function playerWorker(audioQueue, play) {
  for await (const audio of audioQueue) {
    await play(audio);
  }
}
function nextBoundaryIndex(text) {
  const idx = text.search(/[.!?,]/);
  return idx >= 0 ? idx : -1;
}
function emitSentence(queue, sentence) {
  const trimmed = sentence.trim();
  if (trimmed) {
    queue.put(trimmed);
  }
}
function handleChunk(state, chunk, queue) {
  state.buffer += chunk;
  let boundary = nextBoundaryIndex(state.buffer);
  while (boundary >= 0) {
    const sentence = state.buffer.slice(0, boundary + 1);
    state.buffer = state.buffer.slice(boundary + 1);
    emitSentence(queue, sentence);
    boundary = nextBoundaryIndex(state.buffer);
  }
}
function getAsyncIterator(source) {
  if (source[Symbol.asyncIterator]) {
    return source;
  }
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of source) {
        yield item;
      }
    }
  };
}
var SimpleQueue = class {
  constructor() {
    this.buffer = [];
    this.resolvers = [];
  }
  put(item) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift();
      resolve?.({ value: item, done: false });
    } else {
      this.buffer.push(item);
    }
  }
  size() {
    return this.buffer.length;
  }
  async get() {
    if (this.buffer.length > 0) {
      return this.buffer.shift();
    }
    return new Promise((resolve) => {
      this.resolvers.push(({ value }) => resolve(value));
    });
  }
  async *[Symbol.asyncIterator]() {
    while (true) {
      const value = await this.get();
      yield value;
    }
  }
};

// src/tts/use-streaming-tts.ts
var defaultSynth = async (text) => text;
var defaultPlayer = async () => void 0;
function useStreamingTTS(options) {
  const textQueue = new SimpleQueue();
  const bufferState = { buffer: "" };
  let ready = false;
  let stopped = false;
  let voice = null;
  const synth = options.synth ?? defaultSynth;
  const play = options.play ?? defaultPlayer;
  const chunkSize = options.chunkSize ?? 48;
  const delayMs = options.delayMs ?? 0;
  async function ensureReady() {
    if (ready) return;
    await ensureOrtReady(options.ort ?? {});
    voice = await ensureVoiceLoaded(options.voice);
    ready = true;
  }
  async function addChunk(text) {
    handleChunk(bufferState, text, textQueue);
    if (bufferState.buffer.length >= chunkSize) {
      emitSentence(textQueue, bufferState.buffer);
      bufferState.buffer = "";
    }
  }
  async function finishStreaming() {
    if (bufferState.buffer) {
      emitSentence(textQueue, bufferState.buffer);
      bufferState.buffer = "";
    }
  }
  function stop() {
    stopped = true;
  }
  async function synthAndPlayChunk(text) {
    await ensureReady();
    const audio = await synth(text, voice);
    await play(audio);
  }
  async function processQueue() {
    await ensureReady();
    const tokenIterator = getAsyncIterator(textQueue);
    const audioIterator = synthesizerWorker(tokenIterator, options.voice, synth);
    await playerWorker(audioIterator, play);
  }
  function createTokenIterable(text) {
    return text.split(/\s+/g).filter(Boolean);
  }
  async function streamTokens(tokens) {
    await ensureReady();
    await streamTokensToSpeech(tokens, {
      chunkSize,
      delayMs,
      onChunk: async (chunk) => {
        if (stopped) return;
        await synthAndPlayChunk(chunk);
      }
    });
  }
  processQueue().catch(() => void 0);
  streamTokens(textQueue).catch(() => void 0);
  return {
    ensureReady,
    addChunk,
    finishStreaming,
    stop,
    synthAndPlayChunk,
    processQueue,
    createTokenIterable
  };
}

// src/internal/speech-state.ts
var SpeechStateManager = class {
  constructor() {
    this.speaking = false;
    this.listeners = [];
  }
  /**
   * Set speaking state (called by STTLogic)
   */
  setSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.listeners.forEach((listener) => listener(speaking));
  }
  /**
   * Get current speaking state
   */
  isSpeaking() {
    return this.speaking;
  }
  /**
   * Subscribe to speaking state changes (called by AudioPlayer)
   */
  onSpeakingChange(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
};
var internalSpeechState = new SpeechStateManager();

// src/tts/audio-player.ts
var _AudioPlayer = class _AudioPlayer {
  constructor(config = {}) {
    this.audioContext = null;
    this.currentSource = null;
    // Queue-related properties
    this.audioQueue = [];
    this.isPlaying = false;
    this.isQueueProcessing = false;
    // Speech-aware playback: pause queue while user is speaking
    this.userSpeaking = false;
    this.config = {
      sampleRate: 22050,
      volume: 1,
      autoPlay: false,
      ...config
    };
    this.speechStateUnsubscribe = internalSpeechState.onSpeakingChange(
      (speaking) => {
        this.setUserSpeaking(speaking);
      }
    );
  }
  // ==========================================================================
  // Singleton Methods (Static)
  // ==========================================================================
  /**
   * Configure the shared singleton (call before first use)
   */
  static configure(config) {
    if (_AudioPlayer.instance) {
      console.log(
        "[AudioPlayer] Singleton already initialized. Call reset() first to reconfigure."
      );
      return;
    }
    _AudioPlayer.sharedConfig = { ..._AudioPlayer.sharedConfig, ...config };
  }
  /**
   * Get the singleton instance (creates if not exists)
   */
  static getInstance() {
    if (!_AudioPlayer.instance) {
      _AudioPlayer.instance = new _AudioPlayer(_AudioPlayer.sharedConfig);
      console.log(
        "[AudioPlayer] Singleton initialized with config:",
        _AudioPlayer.sharedConfig
      );
    }
    return _AudioPlayer.instance;
  }
  /**
   * Reset the singleton (for reconfiguration)
   */
  static async reset() {
    if (_AudioPlayer.instance) {
      await _AudioPlayer.instance.close();
      _AudioPlayer.instance = null;
    }
  }
  // ==========================================================================
  // Instance Methods
  // ==========================================================================
  /**
   * Set status callback for logging
   */
  setStatusCallback(callback) {
    this.onStatusCallback = callback;
  }
  /**
   * Set callback for playing state changes
   */
  setPlayingChangeCallback(callback) {
    this.onPlayingChangeCallback = callback;
  }
  /**
   * Check if audio is currently playing
   */
  isAudioPlaying() {
    return this.isPlaying;
  }
  /**
   * Get current queue size
   */
  getQueueSize() {
    return this.audioQueue.length;
  }
  // ==========================================================================
  // Speech-Aware Playback
  // ==========================================================================
  /**
   * Set user speaking state
   * When user is speaking, queue playback is paused
   * When user stops speaking, queue playback resumes (if autoPlay enabled)
   */
  setUserSpeaking(speaking) {
    if (this.userSpeaking === speaking) return;
    this.userSpeaking = speaking;
    this.log(`[AudioPlayer] User speaking: ${speaking}`);
    this.onUserSpeakingChangeCallback?.(speaking);
    if (!speaking && this.config.autoPlay && this.audioQueue.length > 0) {
      this.log("[AudioPlayer] User stopped speaking, resuming queue playback");
      this.playAudiosFromQueue();
    }
  }
  /**
   * Check if user is currently speaking
   */
  isUserSpeaking() {
    return this.userSpeaking;
  }
  /**
   * Set callback for user speaking state changes
   */
  setUserSpeakingChangeCallback(callback) {
    this.onUserSpeakingChangeCallback = callback;
  }
  /**
   * Add audio to the queue
   * Note: If user is speaking, audio is queued but NOT played until user stops
   */
  addAudioIntoQueue(audioData, sampleRate) {
    const audio = {
      audioData,
      sampleRate: sampleRate ?? this.config.sampleRate
    };
    this.audioQueue.push(audio);
    this.log(
      `[AudioPlayer] Added audio to queue (samples: ${audioData.length}, queue size: ${this.audioQueue.length}, userSpeaking: ${this.userSpeaking})`
    );
    if (this.isQueueProcessing) {
      return;
    }
    if (this.userSpeaking) {
      this.log(
        "[AudioPlayer] User is speaking, audio queued but playback paused"
      );
      return;
    }
    if (this.config.autoPlay) {
      this.playAudiosFromQueue();
    }
  }
  /**
   * Start playing audios from the queue sequentially
   * Pauses if user starts speaking, resumes when they stop
   */
  async playAudiosFromQueue() {
    if (this.audioQueue.length === 0) {
      return;
    }
    if (this.userSpeaking) {
      this.log("[AudioPlayer] Cannot start queue playback - user is speaking");
      return;
    }
    this.isQueueProcessing = true;
    this.log("[AudioPlayer] Starting queue playback");
    try {
      while (this.audioQueue.length > 0) {
        if (this.userSpeaking) {
          this.log(
            "[AudioPlayer] User started speaking, pausing queue playback"
          );
          break;
        }
        const audio = this.audioQueue.shift();
        if (audio) {
          this.setPlayingState(true);
          await this.play(audio.audioData, audio.sampleRate);
        }
      }
    } catch (error) {
      this.log(`[AudioPlayer] Queue playback error: ${error}`);
    } finally {
      this.isQueueProcessing = false;
      this.setPlayingState(false);
      this.log("[AudioPlayer] Queue playback finished");
    }
  }
  /**
   * Play audio data directly
   */
  async play(audioData, sampleRate) {
    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    const audioBuffer = ctx.createBuffer(1, audioData.length, sampleRate);
    audioBuffer.getChannelData(0).set(audioData);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    const gainNode = ctx.createGain();
    gainNode.gain.value = this.config.volume;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    this.currentSource = source;
    source.start(0);
    return new Promise((resolve) => {
      source.onended = () => {
        this.currentSource = null;
        resolve();
      };
    });
  }
  /**
   * Stop current playback (does not clear queue)
   */
  stop() {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
        this.currentSource = null;
      } catch (error) {
      }
    }
  }
  /**
   * Clear the audio queue
   */
  clearQueue() {
    this.audioQueue = [];
    this.log("[AudioPlayer] Queue cleared");
  }
  /**
   * Stop playback and clear the queue
   */
  stopAndClearQueue() {
    this.isQueueProcessing = false;
    this.stop();
    this.clearQueue();
    this.setPlayingState(false);
    this.log("[AudioPlayer] Stopped playback and cleared queue");
  }
  /**
   * Wait for all queued audio to finish playing
   */
  async waitForQueueCompletion() {
    while (this.audioQueue.length > 0 || this.isPlaying) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  /**
   * Set volume (0.0 to 1.0)
   */
  setVolume(volume) {
    this.config.volume = Math.max(0, Math.min(1, volume));
  }
  /**
   * Close the audio context and free resources
   */
  async close() {
    this.stop();
    if (this.speechStateUnsubscribe) {
      this.speechStateUnsubscribe();
    }
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
  // ==========================================================================
  // Private Methods
  // ==========================================================================
  setPlayingState(playing) {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.onPlayingChangeCallback?.(playing);
    }
  }
  log(message) {
    console.log(message);
    this.onStatusCallback?.(message);
  }
  getAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.config.sampleRate
      });
    }
    return this.audioContext;
  }
};
_AudioPlayer.instance = null;
_AudioPlayer.sharedConfig = {
  sampleRate: 22050,
  volume: 1,
  autoPlay: true
};
var AudioPlayer = _AudioPlayer;
function createAudioPlayer(config) {
  return new AudioPlayer(config);
}
var sharedAudioPlayer = {
  /** Configure before first use */
  configure: (config) => AudioPlayer.configure(config),
  /** Get the singleton instance */
  getInstance: () => AudioPlayer.getInstance(),
  /** Add audio to the shared queue */
  addAudioIntoQueue: (audioData, sampleRate) => AudioPlayer.getInstance().addAudioIntoQueue(audioData, sampleRate),
  /** Play audio directly */
  play: (audioData, sampleRate) => AudioPlayer.getInstance().play(audioData, sampleRate),
  /** Start playing from queue */
  playAudiosFromQueue: () => AudioPlayer.getInstance().playAudiosFromQueue(),
  /** Check if playing */
  isAudioPlaying: () => AudioPlayer.getInstance().isAudioPlaying(),
  /** Get queue size */
  getQueueSize: () => AudioPlayer.getInstance().getQueueSize(),
  /** Stop playback */
  stop: () => AudioPlayer.getInstance().stop(),
  /** Clear queue */
  clearQueue: () => AudioPlayer.getInstance().clearQueue(),
  /** Stop and clear */
  stopAndClearQueue: () => AudioPlayer.getInstance().stopAndClearQueue(),
  /** Wait for completion */
  waitForQueueCompletion: () => AudioPlayer.getInstance().waitForQueueCompletion(),
  /** Set volume */
  setVolume: (volume) => AudioPlayer.getInstance().setVolume(volume),
  /** Set status callback */
  setStatusCallback: (callback) => AudioPlayer.getInstance().setStatusCallback(callback),
  /** Set playing state callback */
  setPlayingChangeCallback: (callback) => AudioPlayer.getInstance().setPlayingChangeCallback(callback),
  // Speech-aware playback (automatically managed by STTLogic)
  /** Check if user is speaking */
  isUserSpeaking: () => AudioPlayer.getInstance().isUserSpeaking(),
  /** Set callback for speaking state changes */
  setUserSpeakingChangeCallback: (callback) => AudioPlayer.getInstance().setUserSpeakingChangeCallback(callback),
  /** Manual override for speaking state (usually not needed - handled by STTLogic) */
  setUserSpeaking: (speaking) => AudioPlayer.getInstance().setUserSpeaking(speaking),
  /** Reset singleton */
  reset: () => AudioPlayer.reset(),
  /** Close */
  close: () => AudioPlayer.reset()
};

// src/tts/piper-synthesizer.ts
var DEFAULT_VOICE_ID = "en_US-hfc_female-medium";
var TTSLogic = class {
  constructor(config = {}) {
    this.ready = false;
    this.voiceLoaded = false;
    this.warmUp = true;
    this.config = {
      voiceId: DEFAULT_VOICE_ID,
      sampleRate: 22050,
      useSharedAudioPlayer: true,
      warmUp: true,
      ...config
    };
    this.useSharedPlayer = this.config.useSharedAudioPlayer !== false;
  }
  /**
   * Set a custom AudioPlayer (disables shared player for this instance)
   */
  setAudioPlayer(player) {
    this.audioPlayer = player;
    this.useSharedPlayer = false;
  }
  /**
   * Add audio to the queue (uses shared player by default, or custom if set)
   */
  addInternalAudioToQueue(audio, sampleRate) {
    if (this.audioPlayer) {
      this.audioPlayer.addAudioIntoQueue(audio, sampleRate);
    } else if (this.useSharedPlayer) {
      sharedAudioPlayer.addAudioIntoQueue(audio, sampleRate);
    }
  }
  async warmup(text = "warmup") {
    if (!this.voiceLoaded) {
      throw new Error("Voice not loaded. Call initialize() first.");
    }
    try {
      await piperTts__namespace.predict({
        text,
        voiceId: this.config.voiceId
      });
      console.log("\u2713 Piper synthesizer warmed up");
      return { synthesized: true };
    } catch (error) {
      throw new Error(`Failed to warm up Piper synthesizer: ${error}`);
    }
  }
  /**
   * Initialize the synthesizer by loading the voice model
   */
  async initialize() {
    if (this.ready) return;
    try {
      const voiceId = this.config.voiceId;
      console.log("\u{1F4CD} Loading Piper voice:", voiceId);
      const storedVoices = await piperTts__namespace.stored();
      const alreadyCached = Array.isArray(storedVoices) ? storedVoices.includes(voiceId) : false;
      if (!alreadyCached) {
        console.log("\u2B07\uFE0F Downloading voice model...");
        await piperTts__namespace.download(voiceId, (progress) => {
          if (progress?.total) {
            const pct = Math.round(progress.loaded * 100 / progress.total);
            console.log(`\u2B07\uFE0F Downloading: ${pct}%`);
          }
        });
      } else {
        console.log("\u2713 Voice found in cache");
      }
      this.voiceLoaded = true;
      if (this.config.warmUp) {
        const { synthesized } = await this.warmup();
        if (!synthesized) {
          throw new Error(
            "Failed to warm up Piper synthesizer. Please check the voice model and try again."
          );
        }
      }
      this.ready = true;
      console.log("\u2713 Piper synthesizer initialized");
    } catch (error) {
      throw new Error(`Failed to initialize Piper synthesizer: ${error}`);
    }
  }
  /**
   * Check if the synthesizer is ready
   */
  isReady() {
    return this.ready;
  }
  /**
   * Synthesize speech from text
   * @param text - Text to convert to speech
   * @returns Audio data as WAV Blob and Float32Array
   */
  async synthesize(text) {
    if (!this.ready) {
      throw new Error("Synthesizer not initialized. Call initialize() first.");
    }
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error("No text provided for synthesis");
    }
    try {
      const wavBlob = await piperTts__namespace.predict({
        text: trimmed,
        voiceId: this.config.voiceId
      });
      const arrayBuffer = await wavBlob.arrayBuffer();
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const audioData = decodedBuffer.getChannelData(0);
      audioContext.close();
      return {
        audioBlob: wavBlob,
        audio: audioData,
        sampleRate: decodedBuffer.sampleRate,
        duration: decodedBuffer.duration
      };
    } catch (error) {
      throw new Error(`Synthesis failed: ${error}`);
    }
  }
  /**
   * Synthesize and return WAV Blob only (faster, no decoding)
   */
  async synthesizeToBlob(text) {
    if (!this.ready) {
      throw new Error("Synthesizer not initialized. Call initialize() first.");
    }
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new Error("No text provided for synthesis");
    }
    return piperTts__namespace.predict({
      text: trimmed,
      voiceId: this.config.voiceId
    });
  }
  /**
   * Synthesize text and add to queue (uses shared player by default)
   */
  async synthesizeAndAddToQueue(text) {
    if (!this.audioPlayer && !this.useSharedPlayer) {
      throw new Error("No AudioPlayer set and shared player is disabled");
    }
    const result = await this.synthesize(text);
    this.addInternalAudioToQueue(result.audio, result.sampleRate);
  }
  /**
   * Stop current synthesis (not directly supported, but we can track state)
   */
  stop() {
    console.log("Stop requested");
  }
  /**
   * Dispose of the synthesizer and free resources
   */
  async dispose() {
    this.ready = false;
    this.voiceLoaded = false;
  }
};
function textToPhonemes(_text) {
  console.warn(
    "textToPhonemes is deprecated. Use PiperSynthesizer.synthesize(text) instead."
  );
  return [];
}

// src/tts/filler-manager.ts
var SHORT_FILLER_SYSTEM_PROMPT = `
You are an *interviewer* listening to someone's answer.
Generate brief, natural filler words that show you're actively listening (5-12 words).

Examples: "Okay that makes sense", "Right I understand", "Got it", "I see where you're going", "Yeah that's a good point"

Guidelines:
- Keep responses 5-12 words, natural and varied
- Reference specific content from their speech if possible
- Avoid punctuation except where natural
- Stay in the same language as the user
- If text is unclear, use generic acknowledgments like "Okay I'm following"

Output only your brief reaction. No explanations.
`;
var LONG_FILLER_SYSTEM_PROMPT = `
You are an *interviewer* listening to someone's answer.
Your role is to rephrase what they said to show deep understanding (15-25 words).

Guidelines:
- Rephrase the user's partial message with specific context
- Extract key concepts and mirror them back
- Examples: "So you're explaining how [concept] works...", "In other words the [topic] connects to..."
- Keep responses 15-25 words, declarative (not questions)
- Reference their actual words and ideas
- Stay in the same language as the user

Output only your contextual rephrasing. No explanations.
`;
var DEFAULT_CONFIG = {
  enableShortFiller: false,
  enableLongFiller: false,
  shortFillerDelayMs: 5e3,
  longFillerDelayMs: 1e4,
  shortFillerFallback: "Okay, I understand.",
  longFillerFallback: "Right, that makes sense.",
  llmModel: "deepseek-chat",
  shortFillerPrompt: SHORT_FILLER_SYSTEM_PROMPT,
  longFillerPrompt: LONG_FILLER_SYSTEM_PROMPT,
  llmTimeoutMs: 3e3,
  languageHint: "English"
};
var FillerManager = class {
  constructor(config = {}) {
    this.speechStartedAt = 0;
    this.shortFillerTimer = null;
    this.longFillerTimer = null;
    this.shortFillerGenerated = false;
    this.longFillerGenerated = false;
    this.currentPartialTranscript = "";
    this.inFlight = 0;
    this.ttsLogic = null;
    this.ttsInitPromise = null;
    // Exposed for consumer to see generated fillers
    this.shortFiller = null;
    this.longFiller = null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.setupSpeechStateListener();
    this.initializeTTS();
  }
  initializeTTS() {
    if (!this.config.synthesize) {
      this.ttsLogic = new TTSLogic({
        voiceId: this.config.ttsVoice,
        useSharedAudioPlayer: true,
        // Use shared player for queueing
        warmUp: false
      });
      this.ttsInitPromise = this.ttsLogic.initialize().catch((err) => {
        console.error("[FillerManager] Failed to initialize TTS:", err);
      });
    }
  }
  /**
   * Update configuration
   */
  configure(config) {
    this.config = { ...this.config, ...config };
  }
  /**
   * Set the synthesizer function
   */
  setSynthesizer(synthesize) {
    this.config.synthesize = synthesize;
  }
  /**
   * Update partial transcript (call this on each STT partial result)
   */
  updatePartialTranscript(text) {
    this.currentPartialTranscript = text;
  }
  setupSpeechStateListener() {
    this.unsubscribe = internalSpeechState.onSpeakingChange((speaking) => {
      if (speaking) {
        this.onSpeechStart();
      } else {
        this.onSpeechEnd();
      }
    });
  }
  onSpeechStart() {
    this.speechStartedAt = Date.now();
    this.shortFillerGenerated = false;
    this.longFillerGenerated = false;
    this.shortFiller = null;
    this.longFiller = null;
    this.currentPartialTranscript = "";
    console.log("[FillerManager] Speech started, scheduling fillers");
    if (this.config.enableShortFiller) {
      this.shortFillerTimer = setTimeout(() => {
        this.generateFiller("short");
      }, this.config.shortFillerDelayMs);
    }
    if (this.config.enableLongFiller) {
      this.longFillerTimer = setTimeout(() => {
        this.generateFiller("long");
      }, this.config.longFillerDelayMs);
    }
  }
  onSpeechEnd() {
    console.log("[FillerManager] Speech ended, clearing timers");
    this.clearTimers();
    this.speechStartedAt = 0;
  }
  clearTimers() {
    if (this.shortFillerTimer) {
      clearTimeout(this.shortFillerTimer);
      this.shortFillerTimer = null;
    }
    if (this.longFillerTimer) {
      clearTimeout(this.longFillerTimer);
      this.longFillerTimer = null;
    }
  }
  async generateFiller(type) {
    if (type === "short" && this.shortFillerGenerated) return;
    if (type === "long" && this.longFillerGenerated) return;
    if (type === "short") {
      this.shortFillerGenerated = true;
    } else {
      this.longFillerGenerated = true;
    }
    this.inFlight++;
    let fillerText;
    if (this.config.llmApiUrl && this.config.llmApiKey) {
      try {
        fillerText = await this.generateFillerWithLLM(type);
        console.log(
          `[FillerManager] LLM generated ${type} filler: "${fillerText}"`
        );
      } catch (error) {
        console.error(`[FillerManager] LLM failed, using fallback:`, error);
        fillerText = type === "short" ? this.config.shortFillerFallback : this.config.longFillerFallback;
      }
    } else {
      fillerText = type === "short" ? this.config.shortFillerFallback : this.config.longFillerFallback;
      console.log(
        `[FillerManager] Using fallback ${type} filler: "${fillerText}"`
      );
    }
    if (type === "short") {
      this.shortFiller = fillerText;
    } else {
      this.longFiller = fillerText;
    }
    this.config.onFillerGenerated?.(type, fillerText);
    try {
      if (this.config.synthesize) {
        const result = await this.config.synthesize(fillerText);
        sharedAudioPlayer.addAudioIntoQueue(result.audio, result.sampleRate);
      } else if (this.ttsLogic) {
        if (this.ttsInitPromise) await this.ttsInitPromise;
        await this.ttsLogic.synthesizeAndAddToQueue(fillerText);
      } else {
        console.warn("[FillerManager] No TTS available for filler synthesis");
      }
      console.log(`[FillerManager] ${type} filler queued for playback`);
    } catch (error) {
      console.error(
        `[FillerManager] Failed to synthesize ${type} filler:`,
        error
      );
    }
    this.inFlight--;
  }
  async generateFillerWithLLM(type) {
    const systemPrompt = type === "short" ? this.config.shortFillerPrompt : this.config.longFillerPrompt;
    const userMessage = [
      `Language: ${this.config.languageHint}`,
      "",
      "Current user speech (partial):",
      `"${this.currentPartialTranscript || "(no transcript yet)"}"`,
      "",
      this.shortFiller ? `Previous short filler already generated: "${this.shortFiller}"` : "",
      "",
      "Output only your natural brief reaction."
    ].filter(Boolean).join("\n");
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.llmTimeoutMs
    );
    try {
      const response = await fetch(this.config.llmApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.llmApiKey}`
        },
        body: JSON.stringify({
          model: this.config.llmModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          stream: false
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      return content.trim().slice(0, 100) || this.getFallback(type);
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }
  getFallback(type) {
    return type === "short" ? this.config.shortFillerFallback : this.config.longFillerFallback;
  }
  /**
   * Manually trigger a filler (useful for testing)
   */
  async triggerFiller(type) {
    await this.generateFiller(type);
  }
  /**
   * Reset state for new session
   */
  reset() {
    this.clearTimers();
    this.speechStartedAt = 0;
    this.shortFillerGenerated = false;
    this.longFillerGenerated = false;
    this.shortFiller = null;
    this.longFiller = null;
    this.currentPartialTranscript = "";
  }
  /**
   * Cleanup
   */
  destroy() {
    this.clearTimers();
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }
};
var fillerManagerInstance = null;
function getFillerManager() {
  if (!fillerManagerInstance) {
    fillerManagerInstance = new FillerManager();
  }
  return fillerManagerInstance;
}
function configureFillerManager(config) {
  const manager = getFillerManager();
  manager.configure(config);
  return manager;
}

exports.AudioPlayer = AudioPlayer;
exports.FillerManager = FillerManager;
exports.SimpleQueue = SimpleQueue;
exports.TTSLogic = TTSLogic;
exports.configureFillerManager = configureFillerManager;
exports.createAudioPlayer = createAudioPlayer;
exports.createOrtEnvironment = createOrtEnvironment;
exports.emitSentence = emitSentence;
exports.ensureOrtReady = ensureOrtReady;
exports.ensureVoiceLoaded = ensureVoiceLoaded;
exports.getAsyncIterator = getAsyncIterator;
exports.getBackendLabel = getBackendLabel;
exports.getFillerManager = getFillerManager;
exports.handleChunk = handleChunk;
exports.isCorruptModelError = isCorruptModelError;
exports.nextBoundaryIndex = nextBoundaryIndex;
exports.playerWorker = playerWorker;
exports.preparePiperVoice = preparePiperVoice;
exports.resetVoiceCache = resetVoiceCache;
exports.sharedAudioPlayer = sharedAudioPlayer;
exports.streamTokensToSpeech = streamTokensToSpeech;
exports.synthesizerWorker = synthesizerWorker;
exports.textToPhonemes = textToPhonemes;
exports.useStreamingTTS = useStreamingTTS;
exports.warmupPiper = warmupPiper;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map