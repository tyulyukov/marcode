import { Schema } from "effect";

export const WHISPER_MODELS = [
  { id: "Xenova/whisper-tiny", label: "Tiny", size: "~39 MB", accuracy: "Fair", speed: "Fastest" },
  { id: "Xenova/whisper-base", label: "Base", size: "~142 MB", accuracy: "Good", speed: "Fast" },
  {
    id: "Xenova/whisper-small",
    label: "Small",
    size: "~466 MB",
    accuracy: "Very good",
    speed: "Moderate",
  },
  {
    id: "Xenova/whisper-medium",
    label: "Medium",
    size: "~1.5 GB",
    accuracy: "Excellent",
    speed: "Slow",
  },
] as const;

export type WhisperModelDefinition = (typeof WHISPER_MODELS)[number];

export const TranscribeInput = Schema.Struct({
  audio: Schema.String,
  language: Schema.optional(Schema.String),
});
export type TranscribeInput = typeof TranscribeInput.Type;

export const TranscribeResult = Schema.Struct({
  text: Schema.String,
});
export type TranscribeResult = typeof TranscribeResult.Type;

export const TranscriptionCleanupInput = Schema.Struct({
  rawText: Schema.String,
  language: Schema.optional(Schema.String),
});
export type TranscriptionCleanupInput = typeof TranscriptionCleanupInput.Type;

export const TranscriptionCleanupResult = Schema.Struct({
  cleanedText: Schema.String,
});
export type TranscriptionCleanupResult = typeof TranscriptionCleanupResult.Type;

export const WhisperInstallModelInput = Schema.Struct({
  modelId: Schema.String,
});
export type WhisperInstallModelInput = typeof WhisperInstallModelInput.Type;

export const WhisperDeleteModelInput = Schema.Struct({
  modelId: Schema.String,
});
export type WhisperDeleteModelInput = typeof WhisperDeleteModelInput.Type;

export const WhisperDownloadProgressPayload = Schema.Struct({
  modelId: Schema.String,
  progress: Schema.Number,
  file: Schema.String,
  status: Schema.Literals(["downloading", "complete", "error"]),
  error: Schema.optional(Schema.String),
});
export type WhisperDownloadProgressPayload = typeof WhisperDownloadProgressPayload.Type;

export const TRANSCRIPTION_WS_METHODS = {
  transcribe: "transcription.transcribe",
  cleanup: "transcription.cleanup",
  installModel: "whisper.installModel",
  deleteModel: "whisper.deleteModel",
} as const;

export const WHISPER_WS_CHANNELS = {
  downloadProgress: "whisper.downloadProgress",
} as const;
