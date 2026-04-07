import { parentPort } from "node:worker_threads";
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import * as fs from "node:fs";
import * as path from "node:path";

if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = false;
}

let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let currentModel: string | null = null;
let cacheDir: string | null = null;

function getCacheDir(): string {
  if (cacheDir) return cacheDir;
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  cacheDir = path.join(homeDir, ".marcode", "whisper-models");
  fs.mkdirSync(cacheDir, { recursive: true });
  return cacheDir;
}

function getModelCacheDir(modelId: string): string {
  return path.join(getCacheDir(), modelId.replace("/", "__"));
}

function isModelInstalled(modelId: string): boolean {
  const modelDir = getModelCacheDir(modelId);
  if (!fs.existsSync(modelDir)) return false;
  const files = fs.readdirSync(modelDir, { recursive: true }) as string[];
  return files.some((f) => typeof f === "string" && f.endsWith(".onnx"));
}

async function handleMessage(message: { type: string; [key: string]: unknown }) {
  try {
    switch (message.type) {
      case "check-installed": {
        const models = message.models as string[];
        const statuses = models.map((modelId) => ({
          modelId,
          installed: isModelInstalled(modelId),
        }));
        parentPort?.postMessage({ type: "install-status", statuses });
        break;
      }

      case "install": {
        const modelId = message.model as string;
        env.cacheDir = getCacheDir();
        env.localModelPath = getCacheDir();

        await pipeline("automatic-speech-recognition", modelId, {
          cache_dir: getCacheDir(),
          progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
            if (progress.status === "progress" && progress.progress !== undefined) {
              parentPort?.postMessage({
                type: "install-progress",
                progress: progress.progress,
                file: progress.file || "",
              });
            }
          },
        });
        parentPort?.postMessage({ type: "install-complete" });
        break;
      }

      case "load": {
        const modelId = message.model as string;
        if (transcriber && currentModel === modelId) {
          parentPort?.postMessage({ type: "ready" });
          return;
        }

        transcriber = await pipeline("automatic-speech-recognition", modelId, {
          cache_dir: getCacheDir(),
        });
        currentModel = modelId;
        parentPort?.postMessage({ type: "ready" });
        break;
      }

      case "transcribe": {
        if (!transcriber) {
          parentPort?.postMessage({ type: "error", message: "Model not loaded" });
          return;
        }

        const audioBuffer = message.audioBuffer as SharedArrayBuffer;
        const length = message.length as number;
        const language = message.language as string | null;

        const audioData = new Float32Array(audioBuffer, 0, length);

        const options: Record<string, string> = { task: "transcribe" };
        if (language) {
          options.language = language;
        }
        const result = await transcriber(audioData, options);

        const text =
          typeof result === "object" && "text" in result
            ? (result as { text: string }).text
            : String(result);
        parentPort?.postMessage({ type: "result", text: text.trim() });
        break;
      }

      case "delete": {
        const modelId = message.model as string;
        const modelDir = getModelCacheDir(modelId);
        if (fs.existsSync(modelDir)) {
          fs.rmSync(modelDir, { recursive: true, force: true });
        }
        if (currentModel === modelId) {
          transcriber = null;
          currentModel = null;
        }
        parentPort?.postMessage({ type: "deleted" });
        break;
      }
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    parentPort?.postMessage({ type: "error", message: errorMessage });
  }
}

parentPort?.on("message", (message) => {
  void handleMessage(message);
});
