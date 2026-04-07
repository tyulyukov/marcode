import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import * as fs from "node:fs";
import * as path from "node:path";

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let currentModel: string | null = null;

function getCacheDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  const dir = path.join(homeDir, ".marcode", "whisper-models");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function send(msg: Record<string, unknown>): void {
  process.send?.(msg);
}

async function handleMessage(message: { type: string; id?: string; [key: string]: unknown }) {
  const id = message.id;
  try {
    switch (message.type) {
      case "transcribe": {
        const modelId = message.model as string;
        const audioBase64 = message.audio as string;
        const language = message.language as string | null;
        const cacheDir = getCacheDir();

        console.error(
          `[whisper-child] transcribe request: model=${modelId}, audio=${audioBase64.length} chars, language=${language ?? "auto"}`,
        );

        if (!transcriber || currentModel !== modelId) {
          console.error(`[whisper-child] loading model ${modelId}...`);
          transcriber = await pipeline("automatic-speech-recognition", modelId, {
            cache_dir: cacheDir,
          });
          currentModel = modelId;
          console.error(`[whisper-child] model loaded`);
        }

        const audioBytes = Buffer.from(audioBase64, "base64");
        const pcmData = decodeWavToPcm(audioBytes);
        console.error(
          `[whisper-child] decoded WAV: ${pcmData.length} samples (${(pcmData.length / 16000).toFixed(1)}s)`,
        );

        const options: Record<string, string> = {
          task: "transcribe",
          language: language || "en",
        };
        console.error(`[whisper-child] running inference with language=${options.language}...`);
        const result = await transcriber(pcmData, options);
        console.error(`[whisper-child] inference done, raw result type: ${typeof result}`);

        const text =
          typeof result === "object" && "text" in result
            ? (result as { text: string }).text
            : String(result);

        console.error(`[whisper-child] text: "${text.trim()}"`);
        send({ type: "result", id, text: text.trim() });
        break;
      }

      case "install": {
        const modelId = message.model as string;
        const cacheDir = getCacheDir();
        env.cacheDir = cacheDir;

        await pipeline("automatic-speech-recognition", modelId, {
          cache_dir: cacheDir,
          progress_callback: (p: { status: string; progress?: number; file?: string }) => {
            if (p.status === "progress" && p.progress !== undefined) {
              send({
                type: "install-progress",
                id,
                progress: p.progress,
                file: p.file || "",
              });
            }
          },
        });
        send({ type: "install-complete", id });
        break;
      }

      default:
        send({ type: "error", id, message: `Unknown message type: ${message.type}` });
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    send({ type: "error", id, message: errorMessage });
  }
}

function decodeWavToPcm(wavBuffer: Buffer): Float32Array {
  const dataView = new DataView(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength);
  let offset = 12;
  while (offset < dataView.byteLength - 8) {
    const chunkId = String.fromCharCode(
      dataView.getUint8(offset),
      dataView.getUint8(offset + 1),
      dataView.getUint8(offset + 2),
      dataView.getUint8(offset + 3),
    );
    const chunkSize = dataView.getUint32(offset + 4, true);
    if (chunkId === "data") {
      offset += 8;
      const sampleCount = chunkSize / 2;
      const pcm = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const sample = dataView.getInt16(offset + i * 2, true);
        pcm[i] = sample / 32768;
      }
      return pcm;
    }
    offset += 8 + chunkSize;
  }
  throw new Error("Invalid WAV: no data chunk found");
}

process.on("message", (message) => {
  void handleMessage(message as { type: string; id?: string; [key: string]: unknown });
});

send({ type: "ready" });
