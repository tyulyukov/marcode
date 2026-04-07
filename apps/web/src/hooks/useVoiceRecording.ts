import { useCallback, useEffect, useRef, useState } from "react";
import { readNativeApi } from "~/nativeApi";
import { audioBlobToWavBase64 } from "../lib/audioEncoder";

type VoiceRecordingStatus = "idle" | "recording" | "transcribing" | "cleaning-up";

type VoiceRecordingError =
  | { type: "permission-denied" }
  | { type: "no-microphone" }
  | { type: "not-supported" }
  | { type: "transcription-failed"; message: string }
  | { type: "cleanup-failed"; message: string };

interface UseVoiceRecordingOptions {
  onTranscript: (text: string) => void;
  onError?: (error: VoiceRecordingError) => void;
  ready: boolean;
  language: string;
  llmCleanup: boolean;
}

interface UseVoiceRecordingReturn {
  status: VoiceRecordingStatus;
  isRecording: boolean;
  isProcessing: boolean;
  isSupported: boolean;
  analyserNode: AnalyserNode | null;
  toggleRecording: () => void;
  stopRecording: () => void;
  error: VoiceRecordingError | null;
}

const isSupported =
  typeof navigator !== "undefined" &&
  typeof navigator.mediaDevices !== "undefined" &&
  typeof MediaRecorder !== "undefined";

export function useVoiceRecording(options: UseVoiceRecordingOptions): UseVoiceRecordingReturn {
  const { onTranscript, onError, ready, language, llmCleanup } = options;
  const [status, setStatus] = useState<VoiceRecordingStatus>("idle");
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [error, setError] = useState<VoiceRecordingError | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const languageRef = useRef(language);
  languageRef.current = language;
  const llmCleanupRef = useRef(llmCleanup);
  llmCleanupRef.current = llmCleanup;

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setAnalyserNode(null);
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const processRecording = useCallback(async (audioBlob: Blob) => {
    try {
      setStatus("transcribing");
      console.log("[voice] processing recording, blob size:", audioBlob.size);
      const wavBase64 = await audioBlobToWavBase64(audioBlob);
      console.log("[voice] WAV base64 length:", wavBase64.length);
      const api = readNativeApi();
      if (!api) {
        throw new Error("API not available");
      }

      const lang = languageRef.current;
      console.log("[voice] sending transcribe request, language:", lang);
      const result = await api.transcription.transcribe({
        audio: wavBase64,
        language: lang,
      });
      console.log("[voice] transcription result:", JSON.stringify(result));

      let finalText = result.text;

      if (llmCleanupRef.current && finalText.trim().length > 0) {
        setStatus("cleaning-up");
        try {
          const cleanupResult = await api.transcription.cleanup({
            rawText: finalText,
            language: lang,
          });
          finalText = cleanupResult.cleanedText;
        } catch {
          const cleanupError: VoiceRecordingError = {
            type: "cleanup-failed",
            message: "Cleanup skipped",
          };
          onErrorRef.current?.(cleanupError);
        }
      }

      console.log("[voice] final text:", JSON.stringify(finalText));
      if (finalText.trim().length > 0) {
        onTranscriptRef.current(finalText.trim());
      } else {
        console.warn("[voice] empty transcription result");
      }
    } catch (err) {
      console.error("[voice] transcription error:", err);
      const transcriptionError: VoiceRecordingError = {
        type: "transcription-failed",
        message: err instanceof Error ? err.message : "Transcription failed",
      };
      setError(transcriptionError);
      onErrorRef.current?.(transcriptionError);
    } finally {
      setStatus("idle");
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setAnalyserNode(analyser);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanup();
        if (blob.size > 0) {
          void processRecording(blob);
        } else {
          setStatus("idle");
        }
      };

      recorder.start(100);
      setStatus("recording");
    } catch (err) {
      cleanup();
      const errorName = err instanceof DOMException ? err.name : "";
      if (errorName === "NotAllowedError") {
        const permError: VoiceRecordingError = { type: "permission-denied" };
        setError(permError);
        onErrorRef.current?.(permError);
      } else if (errorName === "NotFoundError") {
        const micError: VoiceRecordingError = { type: "no-microphone" };
        setError(micError);
        onErrorRef.current?.(micError);
      } else {
        const genericError: VoiceRecordingError = {
          type: "transcription-failed",
          message: err instanceof Error ? err.message : "Failed to start recording",
        };
        setError(genericError);
        onErrorRef.current?.(genericError);
      }
    }
  }, [cleanup, processRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (!ready) return;
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle") {
      void startRecording();
    }
  }, [ready, status, startRecording, stopRecording]);

  return {
    status,
    isRecording: status === "recording",
    isProcessing: status === "transcribing" || status === "cleaning-up",
    isSupported,
    analyserNode,
    toggleRecording,
    stopRecording,
    error,
  };
}
