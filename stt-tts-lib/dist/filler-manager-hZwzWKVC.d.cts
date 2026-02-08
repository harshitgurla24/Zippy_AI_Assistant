/**
 * stt-tts-lib - Filler Word Manager
 *
 * Generates contextual filler words using LLM at configurable intervals.
 * Audio is synthesized immediately but only plays when user stops speaking.
 */
interface FillerConfig {
    /** Enable short filler (default: false) */
    enableShortFiller?: boolean;
    /** Enable long filler (default: false) */
    enableLongFiller?: boolean;
    /** Delay before short filler in ms (default: 5000) */
    shortFillerDelayMs?: number;
    /** Delay before long filler in ms (default: 10000) */
    longFillerDelayMs?: number;
    /** Fallback short filler text if LLM fails */
    shortFillerFallback?: string;
    /** Fallback long filler text if LLM fails */
    longFillerFallback?: string;
    /** LLM API URL (required for dynamic fillers) */
    llmApiUrl?: string;
    /** LLM API Key */
    llmApiKey?: string;
    /** LLM Model name (default: "deepseek-chat") */
    llmModel?: string;
    /** Custom system prompt for short filler */
    shortFillerPrompt?: string;
    /** Custom system prompt for long filler */
    longFillerPrompt?: string;
    /** LLM request timeout in ms (default: 3000) */
    llmTimeoutMs?: number;
    /** Language hint for LLM (e.g., "English", "Hindi") */
    languageHint?: string;
    /** TTS voice ID for filler synthesis (uses default if not set) */
    ttsVoice?: string;
    /** Callback when filler is generated */
    onFillerGenerated?: (type: "short" | "long", text: string) => void;
    /** Custom synthesizer function (overrides internal TTS if provided) */
    synthesize?: (text: string) => Promise<{
        audio: Float32Array;
        sampleRate: number;
    }>;
}
declare class FillerManager {
    private config;
    private speechStartedAt;
    private shortFillerTimer;
    private longFillerTimer;
    private shortFillerGenerated;
    private longFillerGenerated;
    private unsubscribe?;
    private currentPartialTranscript;
    private inFlight;
    private ttsLogic;
    private ttsInitPromise;
    shortFiller: string | null;
    longFiller: string | null;
    constructor(config?: FillerConfig);
    private initializeTTS;
    /**
     * Update configuration
     */
    configure(config: Partial<FillerConfig>): void;
    /**
     * Set the synthesizer function
     */
    setSynthesizer(synthesize: FillerConfig["synthesize"]): void;
    /**
     * Update partial transcript (call this on each STT partial result)
     */
    updatePartialTranscript(text: string): void;
    private setupSpeechStateListener;
    private onSpeechStart;
    private onSpeechEnd;
    private clearTimers;
    private generateFiller;
    private generateFillerWithLLM;
    private getFallback;
    /**
     * Manually trigger a filler (useful for testing)
     */
    triggerFiller(type: "short" | "long"): Promise<void>;
    /**
     * Reset state for new session
     */
    reset(): void;
    /**
     * Cleanup
     */
    destroy(): void;
}
declare function getFillerManager(): FillerManager;
declare function configureFillerManager(config: FillerConfig): FillerManager;

export { FillerManager as F, type FillerConfig as a, configureFillerManager as c, getFillerManager as g };
