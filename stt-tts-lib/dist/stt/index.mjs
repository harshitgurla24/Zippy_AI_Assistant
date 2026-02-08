import { getDefaultRealTimeVADOptions, MicVAD } from '@ricky0123/vad-web';
import * as piperTts from '@realtimex/piper-tts-web';

// src/stt/reset-stt-logic.ts
var ResetSTTLogic = class {
  constructor(options = {}) {
    this.partialTranscript = "";
    this.maxSilenceMs = options.maxSilenceMs ?? 2e3;
    this.maxUtteranceMs = options.maxUtteranceMs ?? 15e3;
    this.onReset = options.onReset;
    this.now = options.now ?? (() => Date.now());
    const start = this.now();
    this.utteranceStartedAt = start;
    this.lastActivityAt = start;
  }
  recordSpeechActivity(timestamp) {
    const now = timestamp ?? this.now();
    this.lastActivityAt = now;
    if (!this.utteranceStartedAt) {
      this.utteranceStartedAt = now;
    }
  }
  updatePartialTranscript(partial, timestamp) {
    this.partialTranscript = partial;
    this.recordSpeechActivity(timestamp);
  }
  shouldReset(timestamp) {
    const now = timestamp ?? this.now();
    const silenceElapsed = now - this.lastActivityAt;
    const utteranceElapsed = now - this.utteranceStartedAt;
    if (silenceElapsed >= this.maxSilenceMs) {
      return "silence";
    }
    if (utteranceElapsed >= this.maxUtteranceMs) {
      return "utterance-complete";
    }
    return null;
  }
  maybeReset(timestamp) {
    const reason = this.shouldReset(timestamp);
    if (reason) {
      this.reset(reason, timestamp);
    }
    return reason;
  }
  forceReset(reason = "manual", timestamp) {
    this.reset(reason, timestamp);
  }
  reset(reason, timestamp) {
    const now = timestamp ?? this.now();
    const stats = {
      utteranceStartedAt: this.utteranceStartedAt,
      lastActivityAt: this.lastActivityAt,
      partialTranscript: this.partialTranscript
    };
    this.utteranceStartedAt = now;
    this.lastActivityAt = now;
    this.partialTranscript = "";
    if (this.onReset) {
      this.onReset(reason, stats);
    }
  }
};
var VADController = class {
  constructor(options) {
    this.vad = null;
    this.voiceStartListeners = /* @__PURE__ */ new Set();
    this.voiceStopListeners = /* @__PURE__ */ new Set();
    this.running = false;
    this.options = options;
  }
  async start() {
    if (this.running && this.vad) {
      if (!this.vad.listening) {
        await this.vad.start();
      }
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("Microphone access is not available.");
    }
    try {
      const ortAny = window.ort;
      if (ortAny && ortAny.env && ortAny.env.wasm) {
        ortAny.env.wasm.wasmPaths = "/ort/";
      }
      if (!this.vad) {
        const defaultOptions = getDefaultRealTimeVADOptions("v5");
        this.vad = await MicVAD.new({
          ...defaultOptions,
          startOnLoad: false,
          onSpeechStart: () => {
            this.emitVoiceStart();
          },
          onSpeechEnd: (audio) => {
            this.emitVoiceStop();
          },
          onVADMisfire: () => {
          },
          minSpeechMs: this.options?.minSpeechMs || 150,
          positiveSpeechThreshold: 0.5,
          negativeSpeechThreshold: 0.35,
          redemptionMs: this.options?.minSilenceMs || 450,
          preSpeechPadMs: 50,
          processorType: "ScriptProcessor",
          onnxWASMBasePath: "/ort/",
          baseAssetPath: "/vad/",
          workletOptions: {}
        });
      }
      if (!this.vad.listening) {
        await this.vad.start();
      }
      this.running = true;
    } catch (error) {
      this.running = false;
      throw new Error(
        error?.message || "Failed to initialize voice activity detector"
      );
    }
  }
  stop() {
    if (!this.running || !this.vad) return;
    try {
      this.vad.pause();
      this.running = false;
    } catch (error) {
    }
  }
  destroy() {
    this.stop();
    if (this.vad) {
      try {
        this.vad.destroy();
      } catch (error) {
      }
      this.vad = null;
    }
    this.voiceStartListeners.clear();
    this.voiceStopListeners.clear();
  }
  isActive() {
    return this.running && this.vad !== null && this.vad.listening;
  }
  onVoiceStart(listener) {
    this.voiceStartListeners.add(listener);
    return () => this.voiceStartListeners.delete(listener);
  }
  onVoiceStop(listener) {
    this.voiceStopListeners.add(listener);
    return () => this.voiceStopListeners.delete(listener);
  }
  emitVoiceStart() {
    this.voiceStartListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice start listener:", error);
      }
    });
  }
  emitVoiceStop() {
    this.voiceStopListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error("Error in voice stop listener:", error);
      }
    });
  }
};

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
      await piperTts.predict({
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
      const storedVoices = await piperTts.stored();
      const alreadyCached = Array.isArray(storedVoices) ? storedVoices.includes(voiceId) : false;
      if (!alreadyCached) {
        console.log("\u2B07\uFE0F Downloading voice model...");
        await piperTts.download(voiceId, (progress) => {
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
      const wavBlob = await piperTts.predict({
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
    return piperTts.predict({
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

// src/stt/stt-logic.ts
var ResetSTTLogic2 = class {
  constructor(onLog, onTranscript, options = {}) {
    this.isListening = false;
    this.fullTranscript = "";
    this.heardWords = [];
    this.onWordsUpdate = null;
    this.onMicTimeUpdate = null;
    this.onRestartMetrics = null;
    this.micOnTime = 0;
    this.sessionDuration = 3e4;
    this.lastTickTime = 0;
    this.micTimeInterval = null;
    this.restartCount = 0;
    this.isRestarting = false;
    this.isRecognitionRunning = false;
    this.lastInterimTranscript = "";
    this.lastInterimSaveTime = 0;
    this.interimSaveInterval = 1e3;
    this.lastInterimResultTime = 0;
    this.lastSavedLength = 0;
    this.transcriptBeforeRestart = "";
    this.sessionStartTranscript = "";
    this.sessionId = 0;
    this.awaitingRestartFirstResultId = null;
    this.lastWasFinal = false;
    this.restartMetrics = {};
    this.isAutoRestarting = false;
    this.fillerManager = null;
    this.onLog = onLog;
    this.onTranscript = onTranscript;
    this.options = {
      sessionDurationMs: options.sessionDurationMs ?? 3e4,
      interimSaveIntervalMs: options.interimSaveIntervalMs ?? 5e3,
      preserveTranscriptOnStart: options.preserveTranscriptOnStart ?? false
    };
    this.sessionDuration = this.options.sessionDurationMs;
    this.interimSaveInterval = this.options.interimSaveIntervalMs;
    if (options.enableShortFiller || options.enableLongFiller) {
      this.fillerManager = new FillerManager({
        enableShortFiller: options.enableShortFiller,
        enableLongFiller: options.enableLongFiller,
        shortFillerDelayMs: options.shortFillerDelayMs,
        longFillerDelayMs: options.longFillerDelayMs,
        shortFillerFallback: options.shortFillerFallback,
        longFillerFallback: options.longFillerFallback,
        // LLM configuration for dynamic filler generation
        llmApiUrl: options.llmApiUrl,
        llmApiKey: options.llmApiKey,
        llmModel: options.llmModel,
        llmTimeoutMs: options.llmTimeoutMs,
        languageHint: options.languageHint,
        onFillerGenerated: options.onFillerGenerated
      });
      this.onLog(
        `[STTLogic] Filler manager initialized (short: ${options.enableShortFiller}, long: ${options.enableLongFiller}, LLM: ${options.llmApiUrl ? "configured" : "disabled"})`,
        "info"
      );
    }
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      this.onLog("Speech Recognition API not supported", "error");
      throw new Error("Speech Recognition API not available");
    }
    this.recognition = new SpeechRecognitionAPI();
    this.setupRecognition();
  }
  setWordsUpdateCallback(callback) {
    this.onWordsUpdate = callback;
  }
  setMicTimeUpdateCallback(callback) {
    this.onMicTimeUpdate = callback;
  }
  setRestartMetricsCallback(callback) {
    this.onRestartMetrics = callback;
  }
  setVadCallbacks(onSpeechStart, onSpeechEnd) {
    this.onUserSpeechStart = onSpeechStart || void 0;
    this.onUserSpeechEnd = onSpeechEnd || void 0;
  }
  getSessionDurationMs() {
    return this.sessionDuration;
  }
  isInAutoRestart() {
    return this.isAutoRestarting;
  }
  getFullTranscript() {
    if (this.transcriptBeforeRestart.length > 0) {
      if (this.fullTranscript.length > 0) {
        return (this.transcriptBeforeRestart + " " + this.fullTranscript).trim();
      }
      return this.transcriptBeforeRestart;
    }
    return this.fullTranscript;
  }
  clearTranscript() {
    this.fullTranscript = "";
    this.transcriptBeforeRestart = "";
    this.sessionStartTranscript = "";
    this.heardWords = [];
  }
  setupRecognition() {
    this.recognition.lang = "en-US";
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;
    this.resultHandler = (event) => {
      const speechEvent = event;
      let completeTranscript = "";
      for (let i = 0; i < speechEvent.results.length; i++) {
        completeTranscript += speechEvent.results[i][0].transcript + " ";
      }
      completeTranscript = completeTranscript.trim();
      const isFinal = speechEvent.results[speechEvent.results.length - 1].isFinal;
      completeTranscript = this.collapseRepeats(completeTranscript);
      this.lastInterimTranscript = completeTranscript;
      this.lastInterimResultTime = Date.now();
      if (this.fillerManager && !isFinal) {
        this.fillerManager.updatePartialTranscript(completeTranscript);
      }
      if (this.awaitingRestartFirstResultId != null) {
        const rid = this.awaitingRestartFirstResultId;
        if (this.restartMetrics[rid] && !this.restartMetrics[rid].firstResultAt) {
          this.restartMetrics[rid].firstResultAt = Date.now();
          const delta = this.restartMetrics[rid].firstResultAt - this.restartMetrics[rid].requestedAt;
          this.onLog(
            `\u{1F514} First result after restart #${rid} in ${delta}ms`,
            "info"
          );
          this.awaitingRestartFirstResultId = null;
        }
      }
      this.onLog(
        `[${isFinal ? "FINAL" : "INTERIM"}] "${completeTranscript}"`,
        isFinal ? "info" : "warning"
      );
      if (!isFinal && this.lastWasFinal) {
        internalSpeechState.setSpeaking(true);
        try {
          this.onUserSpeechStart?.();
        } catch {
        }
      }
      this.lastWasFinal = isFinal;
      if (isFinal) {
        internalSpeechState.setSpeaking(false);
        try {
          this.onUserSpeechEnd?.();
        } catch {
        }
        this.fullTranscript = (this.sessionStartTranscript + " " + completeTranscript).trim();
        this.fullTranscript = this.collapseRepeats(this.fullTranscript);
        this.heardWords = this.fullTranscript.split(/\s+/).filter((word) => word.length > 0);
        this.onTranscript(this.getFullTranscript());
        this.lastSavedLength = this.fullTranscript.length;
        if (this.onWordsUpdate) this.onWordsUpdate(this.heardWords);
        this.lastInterimTranscript = "";
        if (this.awaitingRestartFirstResultId != null) {
          const rid = this.awaitingRestartFirstResultId;
          if (this.restartMetrics[rid] && !this.restartMetrics[rid].firstResultAt) {
            this.restartMetrics[rid].firstResultAt = Date.now();
            this.restartMetrics[rid].startedAt || this.restartMetrics[rid].startAttemptAt || Date.now();
            const firstResultDelta = this.restartMetrics[rid].firstResultAt - this.restartMetrics[rid].requestedAt;
            this.onLog(
              `\u{1F514} First result after restart #${rid} in ${firstResultDelta}ms`,
              "info"
            );
            this.awaitingRestartFirstResultId = null;
          }
        }
      }
    };
    this.recognition.addEventListener("result", this.resultHandler);
    this.errorHandler = (event) => {
      const errorEvent = event;
      if (errorEvent.error === "aborted" && this.isRestarting) {
        this.onLog("Aborted during restart (ignored)", "info");
        this.isRecognitionRunning = false;
        return;
      }
      this.onLog(`Error: ${errorEvent.error}`, "error");
      if (errorEvent.error === "no-speech" || errorEvent.error === "audio-capture" || errorEvent.error === "network") {
        setTimeout(() => {
          if (this.isListening && !this.isRestarting && !this.isRecognitionRunning) {
            try {
              this.recognition.start();
              this.isRecognitionRunning = true;
              this.sessionId++;
            } catch (e) {
              this.onLog(`Failed restart after error: ${e}`, "error");
            }
          }
        }, 500);
      } else {
        this.onLog(
          `Unhandled SpeechRecognition error: ${errorEvent.error}`,
          "warning"
        );
      }
    };
    this.recognition.addEventListener("error", this.errorHandler);
    this.endHandler = () => {
      this.isRecognitionRunning = false;
      if (this.isListening && !this.isRestarting) {
        setTimeout(() => {
          if (this.isListening && !this.isRestarting) {
            try {
              this.recognition.start();
              this.isRecognitionRunning = true;
              this.sessionId++;
              this.onLog(
                `\u{1F501} Auto-resumed recognition after end (session ${this.sessionId})`,
                "info"
              );
            } catch (e) {
              this.onLog(`Failed to auto-start after end: ${e}`, "error");
            }
          }
        }, 100);
      }
    };
    this.recognition.addEventListener("end", this.endHandler);
    this.startHandler = () => {
      this.isRecognitionRunning = true;
      const rid = this.awaitingRestartFirstResultId;
      if (rid != null && this.restartMetrics[rid]) {
        if (!this.restartMetrics[rid].startedAt) {
          this.restartMetrics[rid].startedAt = Date.now();
          this.onLog(
            `\u25B6\uFE0F Restart #${rid} recognition started in ${this.restartMetrics[rid].startedAt - this.restartMetrics[rid].requestedAt}ms`,
            "info"
          );
        }
      }
    };
    this.recognition.addEventListener("start", this.startHandler);
  }
  waitForEventOnce(eventName, timeoutMs) {
    return new Promise((resolve) => {
      let timer = null;
      const handler = (ev) => {
        if (timer !== null) clearTimeout(timer);
        this.recognition.removeEventListener(eventName, handler);
        resolve(ev);
      };
      this.recognition.addEventListener(eventName, handler);
      timer = window.setTimeout(() => {
        this.recognition.removeEventListener(eventName, handler);
        resolve(null);
      }, timeoutMs);
    });
  }
  startMicTimer() {
    this.lastTickTime = Date.now();
    this.lastInterimSaveTime = Date.now();
    this.micTimeInterval = window.setInterval(() => {
      if (this.isListening) {
        const now = Date.now();
        const elapsed = now - this.lastTickTime;
        this.micOnTime += elapsed;
        this.lastTickTime = now;
        if (now - this.lastInterimSaveTime >= this.interimSaveInterval) {
          this.saveInterimToFinal();
          this.lastInterimSaveTime = now;
        }
        if (this.micOnTime >= this.sessionDuration) {
          if (!this.isRestarting) this.performRestart();
        }
        if (this.onMicTimeUpdate) this.onMicTimeUpdate(this.micOnTime);
      }
    }, 100);
  }
  stopMicTimer() {
    if (this.micTimeInterval) {
      clearInterval(this.micTimeInterval);
      this.micTimeInterval = null;
    }
  }
  saveInterimToFinal() {
    if (!this.lastInterimTranscript) return;
    const now = Date.now();
    if (now - this.lastInterimResultTime > this.interimSaveInterval && this.lastInterimTranscript.length > this.lastSavedLength) {
      this.fullTranscript = (this.fullTranscript + " " + this.lastInterimTranscript).trim();
      this.fullTranscript = this.collapseRepeats(this.fullTranscript);
      this.lastSavedLength = this.fullTranscript.length;
      if (this.onWordsUpdate) {
        const words = this.fullTranscript.split(/\s+/).filter((w) => w.length > 0);
        this.onWordsUpdate(words);
      }
      this.onTranscript(this.getFullTranscript());
    }
  }
  getSuffixToAppend(base, current) {
    if (!base || base.length === 0) return current;
    if (!current || current.length === 0) return "";
    base = base.trim();
    current = current.trim();
    if (current.startsWith(base)) {
      return current.slice(base.length).trim();
    }
    const maxOverlap = Math.min(base.length, current.length);
    for (let overlap = maxOverlap; overlap > 0; overlap--) {
      if (base.endsWith(current.slice(0, overlap))) {
        return current.slice(overlap).trim();
      }
    }
    return current;
  }
  collapseRepeats(text) {
    if (!text || text.trim().length === 0) return text.trim();
    let normalized = text.replace(/\s+/g, " ").trim();
    const n = normalized.length;
    const lps = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      let j = lps[i - 1];
      while (j > 0 && normalized[i] !== normalized[j]) j = lps[j - 1];
      if (normalized[i] === normalized[j]) j++;
      lps[i] = j;
    }
    const period = n - lps[n - 1];
    if (period < n && n % period === 0) {
      return normalized.slice(0, period).trim();
    }
    const words = normalized.split(" ");
    for (let block = Math.min(20, Math.floor(words.length / 2)); block >= 1; block--) {
      let i = 0;
      while (i + 2 * block <= words.length) {
        let blockA = words.slice(i, i + block).join(" ");
        let blockB = words.slice(i + block, i + 2 * block).join(" ");
        if (blockA === blockB) {
          words.splice(i + block, block);
        } else {
          i++;
        }
      }
    }
    const collapsedWords = [];
    for (const w of words) {
      if (collapsedWords.length === 0 || collapsedWords[collapsedWords.length - 1] !== w)
        collapsedWords.push(w);
    }
    return collapsedWords.join(" ").trim();
  }
  performRestart() {
    if (!this.isListening || this.isRestarting) return;
    const restartStartTime = Date.now();
    this.restartCount++;
    this.isRestarting = true;
    this.isAutoRestarting = true;
    const rid = ++this.sessionId;
    this.awaitingRestartFirstResultId = rid;
    this.restartMetrics[rid] = { requestedAt: restartStartTime };
    this.onLog(
      `\u{1F504} [AUTO-RESTART] Session ${rid} - buffering transcript, waiting for silence...`,
      "warning"
    );
    if (this.lastInterimTranscript.trim().length > 0) {
      this.saveInterimToFinal();
    }
    this.transcriptBeforeRestart = this.getFullTranscript();
    this.fullTranscript = "";
    this.sessionStartTranscript = "";
    this.lastInterimTranscript = "";
    this.heardWords = [];
    this.stopMicTimer();
    const stopTimeout = 600;
    const startTimeout = 1e3;
    const firstResultTimeout = 2e3;
    const stopNow = async () => {
      try {
        if (this.isRecognitionRunning) {
          this.recognition.stop();
        } else {
          this.onLog("Recognition not running at stop attempt", "warning");
        }
      } catch (err) {
        this.onLog(`Stop threw: ${err}`, "warning");
      }
      const endEvent = await this.waitForEventOnce("end", stopTimeout);
      if (!endEvent) {
        try {
          this.recognition.abort();
        } catch (err) {
          this.onLog(`Abort also failed: ${err}`, "error");
        }
        await this.waitForEventOnce("end", 300);
      }
      this.restartMetrics[rid].stopAt = Date.now();
    };
    (async () => {
      await stopNow();
      this.restartMetrics[rid].startAttemptAt = Date.now();
      try {
        if (!this.isRecognitionRunning) {
          this.sessionId = rid;
          this.recognition.start();
        } else {
          this.onLog(
            "Recognition already running at restart time; skipping start.",
            "warning"
          );
        }
      } catch (e) {
        this.onLog(`Failed to start recognition after restart: ${e}`, "error");
      }
      const startEv = await this.waitForEventOnce("start", startTimeout);
      if (startEv) {
        this.restartMetrics[rid].startedAt = Date.now();
      } else {
        this.onLog(
          `Restart #${rid} did not produce start event within ${startTimeout}ms`,
          "warning"
        );
      }
      const resEv = await this.waitForEventOnce("result", firstResultTimeout);
      if (resEv) {
        if (this.restartMetrics[rid])
          this.restartMetrics[rid].firstResultAt = Date.now();
        const firstResultDelta = (this.restartMetrics[rid].firstResultAt || Date.now()) - (this.restartMetrics[rid].requestedAt || Date.now());
        this.onLog(
          `\u{1F514} First result after restart #${rid} in ${firstResultDelta}ms`,
          "info"
        );
      } else {
        this.onLog(
          `Restart #${rid} produced no result within ${firstResultTimeout}ms`,
          "warning"
        );
      }
      const startedAt = this.restartMetrics[rid].startedAt || this.restartMetrics[rid].startAttemptAt || Date.now();
      const restartDuration = startedAt - this.restartMetrics[rid].requestedAt;
      if (this.onRestartMetrics)
        this.onRestartMetrics(this.restartCount, restartDuration);
      this.onLog(
        `\u2705 Session ${rid} restarted in ${restartDuration}ms - resuming from silence gate`,
        "info"
      );
      this.startMicTimer();
      this.isRestarting = false;
      this.isAutoRestarting = false;
    })();
  }
  start() {
    if (this.isListening) return;
    try {
      this.isListening = true;
      if (!this.options.preserveTranscriptOnStart) {
        this.fullTranscript = "";
        this.heardWords = [];
        this.transcriptBeforeRestart = "";
        this.sessionStartTranscript = "";
      } else {
        this.sessionStartTranscript = this.fullTranscript;
      }
      this.micOnTime = 0;
      this.restartCount = 0;
      this.lastSavedLength = 0;
      this.lastInterimTranscript = "";
      this.lastWasFinal = false;
      if (!this.isRecognitionRunning) {
        this.sessionId++;
        this.recognition.start();
        this.isRecognitionRunning = true;
      }
      this.startMicTimer();
      this.onLog(
        "Listening started (auto-restart every 30s of mic time)",
        "info"
      );
    } catch (error) {
      this.isListening = false;
      this.onLog(`Failed to start: ${error}`, "error");
    }
  }
  stop() {
    if (!this.isListening) return;
    try {
      this.isListening = false;
      this.isAutoRestarting = false;
      this.stopMicTimer();
      this.recognition.stop();
      this.isRecognitionRunning = false;
      this.onLog(
        `Stopped listening (total mic time: ${(this.micOnTime / 1e3).toFixed(
          1
        )}s, restarts: ${this.restartCount})`,
        "info"
      );
    } catch (error) {
      this.onLog(`Failed to stop: ${error}`, "error");
    }
  }
  destroy() {
    this.isListening = false;
    this.stopMicTimer();
    if (this.fillerManager) {
      this.fillerManager.destroy();
      this.fillerManager = null;
    }
    try {
      this.recognition.abort?.();
    } catch (e) {
    }
    try {
      if (this.resultHandler)
        this.recognition.removeEventListener("result", this.resultHandler);
      if (this.errorHandler)
        this.recognition.removeEventListener("error", this.errorHandler);
      if (this.endHandler)
        this.recognition.removeEventListener(
          "end",
          this.endHandler
        );
      if (this.startHandler)
        this.recognition.removeEventListener(
          "start",
          this.startHandler
        );
    } catch (e) {
    }
  }
  // ==========================================================================
  // Filler Manager Methods
  // ==========================================================================
  /**
   * Get the filler manager instance (if enabled)
   */
  getFillerManager() {
    return this.fillerManager;
  }
  /**
   * Set a custom synthesizer for filler audio generation.
   * Optional - internal TTS is used by default.
   */
  setFillerSynthesizer(synthesize) {
    if (this.fillerManager) {
      this.fillerManager.setSynthesizer(synthesize);
      this.onLog("[STTLogic] Custom filler synthesizer configured", "info");
    }
  }
  /**
   * Get the generated short filler text (null if not generated yet)
   */
  getShortFiller() {
    return this.fillerManager?.shortFiller ?? null;
  }
  /**
   * Get the generated long filler text (null if not generated yet)
   */
  getLongFiller() {
    return this.fillerManager?.longFiller ?? null;
  }
};
var STTLogic = class extends ResetSTTLogic2 {
};

export { ResetSTTLogic, STTLogic, VADController };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map