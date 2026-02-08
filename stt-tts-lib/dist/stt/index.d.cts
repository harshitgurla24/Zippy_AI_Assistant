import { F as FillerManager } from '../filler-manager-hZwzWKVC.cjs';

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
type ResetReason = "silence" | "utterance-complete" | "manual";
interface ResetStats {
    utteranceStartedAt: number;
    lastActivityAt: number;
    partialTranscript: string;
}
interface ResetSTTOptions$1 {
    /** Maximum silence (ms) allowed before forcing a reset. */
    maxSilenceMs?: number;
    /** Maximum utterance length (ms) before rotating to a fresh buffer. */
    maxUtteranceMs?: number;
    /** Optional reset hook for logging/analytics. */
    onReset?: (reason: ResetReason, stats: ResetStats) => void;
    /**
     * Supply a clock for deterministic tests; defaults to Date.now.
     * Using a function keeps the class platform-neutral.
     */
    now?: () => number;
}
/**
 * Tracks speech activity and decides when to reset an STT pipeline so tokens and streams do not grow unbounded.
 */
declare class ResetSTTLogic$1 {
    private readonly maxSilenceMs;
    private readonly maxUtteranceMs;
    private readonly onReset?;
    private readonly now;
    private utteranceStartedAt;
    private lastActivityAt;
    private partialTranscript;
    constructor(options?: ResetSTTOptions$1);
    recordSpeechActivity(timestamp?: number): void;
    updatePartialTranscript(partial: string, timestamp?: number): void;
    shouldReset(timestamp?: number): ResetReason | null;
    maybeReset(timestamp?: number): ResetReason | null;
    forceReset(reason?: ResetReason, timestamp?: number): void;
    private reset;
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
type VADControllerOptions = {
    bufferSize?: number;
    minSpeechMs?: number;
    minSilenceMs?: number;
    energyThreshold?: number;
    dynamicThresholdFactor?: number;
    noiseFloorSmoothing?: number;
    noiseFloorDecay?: number;
    maxAmplitude?: number;
};
declare class VADController {
    private vad;
    private voiceStartListeners;
    private voiceStopListeners;
    private running;
    private options?;
    constructor(options?: VADControllerOptions);
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
    isActive(): boolean;
    onVoiceStart(listener: () => void): () => void;
    onVoiceStop(listener: () => void): () => void;
    private emitVoiceStart;
    private emitVoiceStop;
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

type WordUpdateCallback = (words: string[]) => void;
type MicTimeUpdateCallback = (ms: number) => void;
type RestartMetricsCallback = (count: number, lastDuration: number | null) => void;
type VadCallbacks = {
    onSpeechStart?: () => void;
    onSpeechEnd?: () => void;
};
type LogCallback = (message: string, type?: "info" | "error" | "warning") => void;
type TranscriptCallback = (transcript: string) => void;
interface ResetSTTOptions {
    sessionDurationMs?: number;
    interimSaveIntervalMs?: number;
    preserveTranscriptOnStart?: boolean;
    /** Enable short filler (default: false) */
    enableShortFiller?: boolean;
    /** Enable long filler (default: false) */
    enableLongFiller?: boolean;
    /** Delay before short filler in ms (default: 5000) */
    shortFillerDelayMs?: number;
    /** Delay before long filler in ms (default: 10000) */
    longFillerDelayMs?: number;
    /** Fallback short filler if LLM fails */
    shortFillerFallback?: string;
    /** Fallback long filler if LLM fails */
    longFillerFallback?: string;
    /** Callback when filler is generated */
    onFillerGenerated?: (type: "short" | "long", text: string) => void;
    /** LLM API URL (required for dynamic filler generation) */
    llmApiUrl?: string;
    /** LLM API Key */
    llmApiKey?: string;
    /** LLM Model name (default: "deepseek-chat") */
    llmModel?: string;
    /** LLM request timeout in ms (default: 3000) */
    llmTimeoutMs?: number;
    /** Language hint for LLM (e.g., "English", "Hindi") */
    languageHint?: string;
}
type STTLogicOptions = ResetSTTOptions;
declare class ResetSTTLogic {
    private recognition;
    private isListening;
    private fullTranscript;
    private heardWords;
    private onLog;
    private onTranscript;
    private onWordsUpdate;
    private onMicTimeUpdate;
    private onRestartMetrics;
    private options;
    private micOnTime;
    private sessionDuration;
    private lastTickTime;
    private micTimeInterval;
    private restartCount;
    private isRestarting;
    private isRecognitionRunning;
    private lastInterimTranscript;
    private lastInterimSaveTime;
    private interimSaveInterval;
    private lastInterimResultTime;
    private lastSavedLength;
    private transcriptBeforeRestart;
    private sessionStartTranscript;
    private resultHandler?;
    private errorHandler?;
    private endHandler?;
    private startHandler?;
    private sessionId;
    private awaitingRestartFirstResultId;
    private lastWasFinal;
    private restartMetrics;
    private isAutoRestarting;
    private onUserSpeechStart?;
    private onUserSpeechEnd?;
    private fillerManager;
    constructor(onLog: LogCallback, onTranscript: TranscriptCallback, options?: ResetSTTOptions);
    setWordsUpdateCallback(callback: WordUpdateCallback): void;
    setMicTimeUpdateCallback(callback: MicTimeUpdateCallback): void;
    setRestartMetricsCallback(callback: RestartMetricsCallback): void;
    setVadCallbacks(onSpeechStart?: () => void, onSpeechEnd?: () => void): void;
    getSessionDurationMs(): number;
    isInAutoRestart(): boolean;
    getFullTranscript(): string;
    clearTranscript(): void;
    private setupRecognition;
    private waitForEventOnce;
    private startMicTimer;
    private stopMicTimer;
    private saveInterimToFinal;
    private getSuffixToAppend;
    private collapseRepeats;
    private performRestart;
    start(): void;
    stop(): void;
    destroy(): void;
    /**
     * Get the filler manager instance (if enabled)
     */
    getFillerManager(): FillerManager | null;
    /**
     * Set a custom synthesizer for filler audio generation.
     * Optional - internal TTS is used by default.
     */
    setFillerSynthesizer(synthesize: (text: string) => Promise<{
        audio: Float32Array;
        sampleRate: number;
    }>): void;
    /**
     * Get the generated short filler text (null if not generated yet)
     */
    getShortFiller(): string | null;
    /**
     * Get the generated long filler text (null if not generated yet)
     */
    getLongFiller(): string | null;
}
declare class STTLogic extends ResetSTTLogic {
}

export { type MicTimeUpdateCallback, type ResetReason, ResetSTTLogic$1 as ResetSTTLogic, type ResetSTTOptions$1 as ResetSTTOptions, type ResetStats, type RestartMetricsCallback, STTLogic, type STTLogicOptions, VADController, type VADControllerOptions, type VadCallbacks, type WordUpdateCallback };
