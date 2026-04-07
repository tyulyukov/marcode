import { Schema } from "effect";

export class TranscriptionError extends Schema.TaggedErrorClass<TranscriptionError>()(
  "TranscriptionError",
  {
    reason: Schema.Literals([
      "model-not-installed",
      "model-loading",
      "inference-failed",
      "invalid-audio",
      "cleanup-failed",
      "worker-crashed",
      "install-failed",
      "delete-failed",
    ]),
    message: Schema.String,
  },
) {}
