export { a as FillerConfig, F as FillerManager, c as configureFillerManager, g as getFillerManager } from '../filler-manager-hZwzWKVC.js';

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
interface PiperVoiceConfig {
    voiceId: string;
    modelPath?: string;
    sampleRate?: number;
    lengthScale?: number;
    noiseScale?: number;
    speaker?: string;
}
interface PreparedPiperVoice {
    voiceId: string;
    modelPath: string;
    sampleRate: number;
    inference: {
        lengthScale: number;
        noiseScale: number;
    };
    metadata: Record<string, unknown>;
}
/**
 * Normalize Piper voice configuration so downstream synthesis gets predictable defaults.
 */
declare function preparePiperVoice(config: PiperVoiceConfig): PreparedPiperVoice;

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
interface StreamTokensOptions {
    chunkSize?: number;
    delayMs?: number;
    onChunk?: (text: string) => Promise<void> | void;
}
interface StreamTokensResult {
    chunksEmitted: number;
    characters: number;
}
/**
 * Convert incremental tokens to speech-sized chunks. Consumers can bridge this into an audio renderer.
 */
declare function streamTokensToSpeech(tokens: AsyncIterable<string> | Iterable<string>, options?: StreamTokensOptions): Promise<StreamTokensResult>;

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
type OrtDevice = "cpu" | "webgpu";
type OrtLogLevel = "verbose" | "warning" | "error";
interface OrtEnvironmentConfig {
    device?: OrtDevice;
    logLevel?: OrtLogLevel;
    providers?: string[];
}
interface OrtEnvironment {
    device: OrtDevice;
    logLevel: OrtLogLevel;
    providers: string[];
    initialized: boolean;
    init: () => Promise<void>;
}
/**
 * Minimal Onnx Runtime bootstrapper. This is intentionally dependency-light: callers can pass
 * a custom provider list when integrating with onnxruntime-web or node-ort.
 */
declare function createOrtEnvironment(config?: OrtEnvironmentConfig): Promise<OrtEnvironment>;

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

type SynthResult = string | ArrayBuffer | Uint8Array;
type Synthesizer = (text: string, voice: PreparedPiperVoice) => Promise<SynthResult>;
type Player = (audio: SynthResult) => Promise<void>;
declare function ensureOrtReady(config?: OrtEnvironmentConfig): Promise<OrtEnvironment>;
declare function ensureVoiceLoaded(config: PiperVoiceConfig): Promise<PreparedPiperVoice>;
declare function warmupPiper(voiceConfig: PiperVoiceConfig, synth: Synthesizer, text?: string): Promise<void>;
declare function resetVoiceCache(): void;
declare function getBackendLabel(device: string | undefined): string;
declare function isCorruptModelError(error: unknown): boolean;
declare function synthesizerWorker(textQueue: AsyncIterable<string>, voiceConfig: PiperVoiceConfig, synth: Synthesizer): AsyncGenerator<SynthResult, void, unknown>;
declare function playerWorker(audioQueue: AsyncIterable<SynthResult>, play: Player): Promise<void>;
declare function nextBoundaryIndex(text: string): number;
declare function emitSentence(queue: SimpleQueue<string>, sentence: string): void;
declare function handleChunk(state: {
    buffer: string;
}, chunk: string, queue: SimpleQueue<string>): void;
declare function getAsyncIterator<T>(source: AsyncIterable<T> | Iterable<T>): AsyncIterable<T>;
declare class SimpleQueue<T> implements AsyncIterable<T> {
    private buffer;
    private resolvers;
    put(item: T): void;
    size(): number;
    get(): Promise<T>;
    [Symbol.asyncIterator](): AsyncIterator<T>;
}

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

interface StreamingTTSOptions {
    voice: PiperVoiceConfig;
    ort?: OrtEnvironmentConfig;
    synth?: Synthesizer;
    play?: Player;
    chunkSize?: number;
    delayMs?: number;
}
interface StreamingTTSController {
    ensureReady(): Promise<void>;
    addChunk(text: string): Promise<void>;
    finishStreaming(): Promise<void>;
    stop(): void;
    synthAndPlayChunk(text: string): Promise<void>;
    processQueue(): Promise<void>;
    createTokenIterable(text: string): Iterable<string>;
}
declare function useStreamingTTS(options: StreamingTTSOptions): StreamingTTSController;

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * Web Audio API Player with Singleton Support
 *
 * Can be used as:
 * 1. Singleton (recommended): sharedAudioPlayer - same queue across entire app
 * 2. Custom instance: new AudioPlayer(config) - separate queue
 *
 * Speech-aware: Automatically pauses queue when user is speaking (via STTLogic).
 */
interface AudioPlayerConfig {
    sampleRate?: number;
    volume?: number;
    autoPlay?: boolean;
}
interface QueuedAudio {
    audioData: Float32Array;
    sampleRate: number;
}
type AudioPlayerStatusCallback = (status: string) => void;
type PlayingStateCallback = (playing: boolean) => void;
/**
 * Audio Player for Web Audio API
 * Supports queue-based playback with autoPlay
 */
declare class AudioPlayer {
    private static instance;
    private static sharedConfig;
    private audioContext;
    private config;
    private currentSource;
    private audioQueue;
    private isPlaying;
    private isQueueProcessing;
    private onStatusCallback?;
    private onPlayingChangeCallback?;
    private userSpeaking;
    private onUserSpeakingChangeCallback?;
    private speechStateUnsubscribe?;
    constructor(config?: AudioPlayerConfig);
    /**
     * Configure the shared singleton (call before first use)
     */
    static configure(config: AudioPlayerConfig): void;
    /**
     * Get the singleton instance (creates if not exists)
     */
    static getInstance(): AudioPlayer;
    /**
     * Reset the singleton (for reconfiguration)
     */
    static reset(): Promise<void>;
    /**
     * Set status callback for logging
     */
    setStatusCallback(callback: AudioPlayerStatusCallback): void;
    /**
     * Set callback for playing state changes
     */
    setPlayingChangeCallback(callback: PlayingStateCallback): void;
    /**
     * Check if audio is currently playing
     */
    isAudioPlaying(): boolean;
    /**
     * Get current queue size
     */
    getQueueSize(): number;
    /**
     * Set user speaking state
     * When user is speaking, queue playback is paused
     * When user stops speaking, queue playback resumes (if autoPlay enabled)
     */
    setUserSpeaking(speaking: boolean): void;
    /**
     * Check if user is currently speaking
     */
    isUserSpeaking(): boolean;
    /**
     * Set callback for user speaking state changes
     */
    setUserSpeakingChangeCallback(callback: (speaking: boolean) => void): void;
    /**
     * Add audio to the queue
     * Note: If user is speaking, audio is queued but NOT played until user stops
     */
    addAudioIntoQueue(audioData: Float32Array, sampleRate?: number): void;
    /**
     * Start playing audios from the queue sequentially
     * Pauses if user starts speaking, resumes when they stop
     */
    playAudiosFromQueue(): Promise<void>;
    /**
     * Play audio data directly
     */
    play(audioData: Float32Array, sampleRate: number): Promise<void>;
    /**
     * Stop current playback (does not clear queue)
     */
    stop(): void;
    /**
     * Clear the audio queue
     */
    clearQueue(): void;
    /**
     * Stop playback and clear the queue
     */
    stopAndClearQueue(): void;
    /**
     * Wait for all queued audio to finish playing
     */
    waitForQueueCompletion(): Promise<void>;
    /**
     * Set volume (0.0 to 1.0)
     */
    setVolume(volume: number): void;
    /**
     * Close the audio context and free resources
     */
    close(): Promise<void>;
    private setPlayingState;
    private log;
    private getAudioContext;
}
/**
 * Create a new AudioPlayer instance (separate queue)
 */
declare function createAudioPlayer(config?: AudioPlayerConfig): AudioPlayer;
/**
 * Shared AudioPlayer singleton
 * Same queue across STTLogic, TTSLogic, and consumer code
 *
 * Usage:
 *   // Configure once (optional)
 *   AudioPlayer.configure({ autoPlay: true });
 *
 *   // Use anywhere - same queue everywhere
 *   sharedAudioPlayer.addAudioIntoQueue(audioData, sampleRate);
 */
declare const sharedAudioPlayer: {
    /** Configure before first use */
    configure: (config: AudioPlayerConfig) => void;
    /** Get the singleton instance */
    getInstance: () => AudioPlayer;
    /** Add audio to the shared queue */
    addAudioIntoQueue: (audioData: Float32Array, sampleRate?: number) => void;
    /** Play audio directly */
    play: (audioData: Float32Array, sampleRate: number) => Promise<void>;
    /** Start playing from queue */
    playAudiosFromQueue: () => Promise<void>;
    /** Check if playing */
    isAudioPlaying: () => boolean;
    /** Get queue size */
    getQueueSize: () => number;
    /** Stop playback */
    stop: () => void;
    /** Clear queue */
    clearQueue: () => void;
    /** Stop and clear */
    stopAndClearQueue: () => void;
    /** Wait for completion */
    waitForQueueCompletion: () => Promise<void>;
    /** Set volume */
    setVolume: (volume: number) => void;
    /** Set status callback */
    setStatusCallback: (callback: AudioPlayerStatusCallback) => void;
    /** Set playing state callback */
    setPlayingChangeCallback: (callback: PlayingStateCallback) => void;
    /** Check if user is speaking */
    isUserSpeaking: () => boolean;
    /** Set callback for speaking state changes */
    setUserSpeakingChangeCallback: (callback: (speaking: boolean) => void) => void;
    /** Manual override for speaking state (usually not needed - handled by STTLogic) */
    setUserSpeaking: (speaking: boolean) => void;
    /** Reset singleton */
    reset: () => Promise<void>;
    /** Close */
    close: () => Promise<void>;
};

/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

interface PiperSynthesizerConfig {
    /** Voice ID (e.g., "en_US-hfc_female-medium") */
    voiceId?: string;
    /** Sample rate (default: 22050) */
    sampleRate?: number;
    /** Use shared audio player singleton (default: true) */
    useSharedAudioPlayer?: boolean;
    warmUp?: boolean;
}
interface SynthesisResult {
    /** Audio data as WAV Blob */
    audioBlob: Blob;
    /** Audio data as Float32Array (for direct playback) */
    audio: Float32Array;
    /** Sample rate */
    sampleRate: number;
    /** Duration in seconds */
    duration: number;
}
/**
 * Piper TTS Synthesizer
 * Uses @mintplex-labs/piper-tts-web for proper text-to-speech conversion
 */
declare class TTSLogic {
    private config;
    private ready;
    private voiceLoaded;
    private audioPlayer?;
    private useSharedPlayer;
    private warmUp;
    constructor(config?: PiperSynthesizerConfig);
    /**
     * Set a custom AudioPlayer (disables shared player for this instance)
     */
    setAudioPlayer(player: AudioPlayer): void;
    /**
     * Add audio to the queue (uses shared player by default, or custom if set)
     */
    addInternalAudioToQueue(audio: Float32Array, sampleRate?: number): void;
    warmup(text?: string): Promise<{
        synthesized: boolean;
    }>;
    /**
     * Initialize the synthesizer by loading the voice model
     */
    initialize(): Promise<void>;
    /**
     * Check if the synthesizer is ready
     */
    isReady(): boolean;
    /**
     * Synthesize speech from text
     * @param text - Text to convert to speech
     * @returns Audio data as WAV Blob and Float32Array
     */
    synthesize(text: string): Promise<SynthesisResult>;
    /**
     * Synthesize and return WAV Blob only (faster, no decoding)
     */
    synthesizeToBlob(text: string): Promise<Blob>;
    /**
     * Synthesize text and add to queue (uses shared player by default)
     */
    synthesizeAndAddToQueue(text: string): Promise<void>;
    /**
     * Stop current synthesis (not directly supported, but we can track state)
     */
    stop(): void;
    /**
     * Dispose of the synthesizer and free resources
     */
    dispose(): Promise<void>;
}
/**
 * Create and initialize a Piper synthesizer
 */
/**
 * @deprecated Use PiperSynthesizer.synthesize() which handles text-to-phoneme internally
 * This is kept for backwards compatibility but should not be used directly
 */
declare function textToPhonemes(_text: string): number[];

export { AudioPlayer, type AudioPlayerConfig, type AudioPlayerStatusCallback, type OrtDevice, type OrtEnvironment, type OrtEnvironmentConfig, type OrtLogLevel, type PiperSynthesizerConfig, type PiperVoiceConfig, type Player, type PlayingStateCallback, type PreparedPiperVoice, type QueuedAudio, SimpleQueue, type StreamTokensOptions, type StreamTokensResult, type StreamingTTSController, type StreamingTTSOptions, type SynthResult, type SynthesisResult, type Synthesizer, TTSLogic, createAudioPlayer, createOrtEnvironment, emitSentence, ensureOrtReady, ensureVoiceLoaded, getAsyncIterator, getBackendLabel, handleChunk, isCorruptModelError, nextBoundaryIndex, playerWorker, preparePiperVoice, resetVoiceCache, sharedAudioPlayer, streamTokensToSpeech, synthesizerWorker, textToPhonemes, useStreamingTTS, warmupPiper };
