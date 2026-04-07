import { fork, spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { Effect, Layer } from "effect";
import type {
  TranscribeInput,
  TranscribeResult,
  TranscriptionCleanupInput,
  TranscriptionCleanupResult,
} from "@marcode/contracts";
import { TranscriptionService } from "../Services/TranscriptionService";
import { TranscriptionError } from "../Errors";
import { unstable_v2_prompt, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { ServerSettingsService } from "../../serverSettings";

const CLEANUP_PROMPT_PREFIX =
  "Clean up this voice-dictated text. Remove filler words (um, uh, like, so, you know), fix grammar and punctuation, and preserve technical terms, code references, and variable names exactly as spoken. Keep the same language as the input. Return ONLY the cleaned text, nothing else — no preamble, no explanation.\n\nText to clean up:\n";

async function cleanupWithClaude(
  rawText: string,
  claudeBinaryPath: string,
  language?: string,
): Promise<TranscriptionCleanupResult> {
  const prompt = `${CLEANUP_PROMPT_PREFIX}${language ? `[Language: ${language}] ` : ""}${rawText}`;

  const result: SDKResultMessage = await unstable_v2_prompt(prompt, {
    model: "claude-haiku-4-5",
    pathToClaudeCodeExecutable: claudeBinaryPath,
    env: process.env,
    disallowedTools: ["*"],
  });

  if (result.subtype === "success" && result.result) {
    return { cleanedText: result.result.trim() };
  }

  console.error("[voice] cleanup failed:", result.subtype === "error" ? result : "unknown error");
  return { cleanedText: rawText };
}

const KNOWN_MODELS = [
  "Xenova/whisper-tiny",
  "Xenova/whisper-base",
  "Xenova/whisper-small",
  "Xenova/whisper-medium",
];

function getModelsCacheDir(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(homeDir, ".marcode", "whisper-models");
}

function isModelInstalledOnDisk(modelId: string): boolean {
  const modelDir = path.join(getModelsCacheDir(), modelId);
  try {
    if (!fs.existsSync(modelDir)) return false;
    const entries = fs.readdirSync(modelDir, { recursive: true });
    return entries.some(
      (f) => typeof f === "string" && (f.endsWith(".onnx") || f.endsWith(".json")),
    );
  } catch {
    return false;
  }
}

function getInstalledModelsFromDisk(): ReadonlyArray<string> {
  return KNOWN_MODELS.filter((id) => isModelInstalledOnDisk(id));
}

function resolveChildScriptPath(): string {
  const basename = "whisperChildProcess";
  const thisDir = import.meta.dirname;

  const searchDirs = [
    path.join(thisDir, ".."),
    path.join(thisDir, "..", "src", "transcription"),
    path.join(thisDir),
    path.join(thisDir, "src", "transcription"),
  ];

  const extensions = [".ts", ".js", ".mjs"];

  for (const dir of searchDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, basename + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  throw new Error(`Could not find ${basename} script. Searched from ${thisDir}`);
}

let child: ChildProcess | null = null;
let childReady = false;
let readyPromise: Promise<void> | null = null;

function ensureChild(): ChildProcess {
  if (child && !child.killed) return child;

  const scriptPath = resolveChildScriptPath();
  console.log("[voice] spawning child process:", scriptPath);
  const isTsFile = scriptPath.endsWith(".ts");

  if (isTsFile) {
    child = spawn("bun", ["run", scriptPath], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });
  } else {
    child = fork(scriptPath, [], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });
  }

  child.stderr?.on("data", (data: Buffer) => {
    console.error("[whisper-child]", data.toString().trim());
  });

  childReady = false;
  readyPromise = new Promise<void>((resolve) => {
    const onReady = (msg: { type: string }) => {
      if (msg.type === "ready") {
        childReady = true;
        child?.off("message", onReady);
        resolve();
      }
    };
    child!.on("message", onReady);
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      console.error("[whisper-child] exited with code", code);
    }
    child = null;
    childReady = false;
    readyPromise = null;
  });

  child.on("error", (err) => {
    console.error("[whisper-child] error:", err.message);
    child = null;
    childReady = false;
    readyPromise = null;
  });

  return child;
}

async function waitForReady(): Promise<void> {
  ensureChild();
  if (childReady) return;
  if (readyPromise) await readyPromise;
}

let messageIdCounter = 0;

function sendToChild<T>(
  message: Record<string, unknown>,
  expectedTypes: string[],
  onInterim?: (msg: Record<string, unknown>) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = String(++messageIdCounter);
    const proc = ensureChild();

    const handler = (response: { type: string; id?: string; message?: string }) => {
      if (response.id !== id) return;

      if (expectedTypes.includes(response.type)) {
        proc.off("message", handler);
        resolve(response as T);
      } else if (response.type === "error") {
        proc.off("message", handler);
        reject(new Error(response.message || "Child process error"));
      } else if (onInterim) {
        onInterim(response as Record<string, unknown>);
      }
    };

    proc.on("message", handler);
    const outgoing = { ...message, id };
    console.log("[voice] sending to child:", message.type, "id:", id);
    proc.send(outgoing);
  });
}

const PROGRESS_THROTTLE_MS = 500;

export const LocalWhisperTranscriptionLive = Layer.succeed(
  TranscriptionService,
  TranscriptionService.of({
    transcribe: (input: TranscribeInput, modelId: string) =>
      Effect.tryPromise({
        try: async () => {
          await waitForReady();
          const result = await sendToChild<{ text: string }>(
            {
              type: "transcribe",
              model: modelId,
              audio: input.audio,
              language: input.language ?? null,
            },
            ["result"],
          );
          return { text: result.text } satisfies TranscribeResult;
        },
        catch: (err) =>
          new TranscriptionError({
            reason: "inference-failed",
            message: err instanceof Error ? err.message : "Transcription failed",
          }),
      }),

    cleanup: (input: TranscriptionCleanupInput, claudeBinaryPath: string) =>
      Effect.tryPromise({
        try: () => cleanupWithClaude(input.rawText, claudeBinaryPath, input.language),
        catch: (err) =>
          new TranscriptionError({
            reason: "cleanup-failed",
            message: err instanceof Error ? err.message : "Cleanup failed",
          }),
      }).pipe(Effect.catch(() => Effect.succeed({ cleanedText: input.rawText }))),

    installModel: (
      modelId: string,
      onProgress: (progress: { progress: number; file: string }) => void,
    ) =>
      Effect.tryPromise({
        try: async () => {
          await waitForReady();
          let lastEmitTime = 0;
          const onnxFileProgress = new Map<string, number>();

          await sendToChild({ type: "install", model: modelId }, ["install-complete"], (msg) => {
            if (msg.type === "install-progress") {
              const file = msg.file as string;
              const progress = msg.progress as number;
              if (!file.endsWith(".onnx")) return;

              onnxFileProgress.set(file, progress);

              const now = Date.now();
              if (now - lastEmitTime < PROGRESS_THROTTLE_MS) return;
              lastEmitTime = now;

              const values = [...onnxFileProgress.values()];
              const overall = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
              onProgress({ progress: Math.round(overall), file });
            }
          });
        },
        catch: (err) =>
          new TranscriptionError({
            reason: "install-failed",
            message: err instanceof Error ? err.message : "Install failed",
          }),
      }),

    deleteModel: (modelId: string) =>
      Effect.sync(() => {
        const modelDir = path.join(getModelsCacheDir(), modelId);
        if (fs.existsSync(modelDir)) {
          fs.rmSync(modelDir, { recursive: true, force: true });
        }
      }),

    getInstalledModels: Effect.sync(() => getInstalledModelsFromDisk()),
  }),
);
