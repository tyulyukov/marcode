import { Effect, ServiceMap } from "effect";
import type {
  TranscribeInput,
  TranscribeResult,
  TranscriptionCleanupInput,
  TranscriptionCleanupResult,
} from "@marcode/contracts";
import type { TranscriptionError } from "../Errors";

export interface TranscriptionServiceShape {
  readonly transcribe: (
    input: TranscribeInput,
    modelId: string,
  ) => Effect.Effect<TranscribeResult, TranscriptionError>;
  readonly cleanup: (
    input: TranscriptionCleanupInput,
    claudeBinaryPath: string,
  ) => Effect.Effect<TranscriptionCleanupResult, TranscriptionError>;
  readonly installModel: (
    modelId: string,
    onProgress: (progress: { progress: number; file: string }) => void,
  ) => Effect.Effect<void, TranscriptionError>;
  readonly deleteModel: (modelId: string) => Effect.Effect<void, TranscriptionError>;
  readonly getInstalledModels: Effect.Effect<ReadonlyArray<string>>;
}

export class TranscriptionService extends ServiceMap.Service<
  TranscriptionService,
  TranscriptionServiceShape
>()("marcode/transcription/TranscriptionService") {}
