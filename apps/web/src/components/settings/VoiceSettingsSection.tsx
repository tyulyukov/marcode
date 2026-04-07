import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { WHISPER_MODELS, type WhisperDownloadProgressPayload } from "@marcode/contracts";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { ensureNativeApi, readNativeApi } from "../../nativeApi";
import { serverConfigQueryOptions, serverQueryKeys } from "../../lib/serverReactQuery";
import { toastManager } from "../ui/toast";

const VOICE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "uk", label: "Ukrainian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "pt", label: "Portuguese" },
  { value: "it", label: "Italian" },
  { value: "pl", label: "Polish" },
  { value: "nl", label: "Dutch" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "tr", label: "Turkish" },
] as const;

const EMPTY_INSTALLED_MODELS: ReadonlyArray<string> = [];

export function VoiceSettingsSection() {
  const queryClient = useQueryClient();
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());

  const voiceEnabled = settings.voiceEnabled;
  const voiceLanguage = settings.voiceLanguage;
  const voiceLlmCleanup = settings.voiceLlmCleanup;
  const whisperSelectedModel = settings.whisperSelectedModel ?? null;

  const installedModels =
    serverConfigQuery.data?.whisper?.installedModels ?? EMPTY_INSTALLED_MODELS;

  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);

  useEffect(() => {
    const api = readNativeApi();
    if (!api?.whisper.onDownloadProgress) return;
    const unsubscribe = api.whisper.onDownloadProgress((event: WhisperDownloadProgressPayload) => {
      if (event.status === "complete") {
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[event.modelId];
          return next;
        });
        setDownloadingModelId((current) => (current === event.modelId ? null : current));
        void queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
        updateSettings({ whisperSelectedModel: event.modelId });
        toastManager.add({
          title: "Model installed",
          description: `${WHISPER_MODELS.find((m) => m.id === event.modelId)?.label ?? event.modelId} is ready to use.`,
          type: "success",
        });
      } else if (event.status === "error") {
        setDownloadProgress((prev) => {
          const next = { ...prev };
          delete next[event.modelId];
          return next;
        });
        setDownloadingModelId((current) => (current === event.modelId ? null : current));
        toastManager.add({
          title: "Download failed",
          description: event.error ?? "An error occurred while downloading the model.",
          type: "error",
        });
      } else {
        setDownloadProgress((prev) => ({
          ...prev,
          [event.modelId]: event.progress,
        }));
      }
    });
    return unsubscribe;
  }, [queryClient, updateSettings]);

  const handleInstall = useCallback(async (modelId: string) => {
    setDownloadingModelId(modelId);
    setDownloadProgress((prev) => ({ ...prev, [modelId]: 0 }));
    try {
      await ensureNativeApi().whisper.installModel({ modelId });
    } catch {
      setDownloadingModelId(null);
      setDownloadProgress((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      toastManager.add({
        title: "Install failed",
        description: "Could not start model download.",
        type: "error",
      });
    }
  }, []);

  const handleDelete = useCallback(
    async (modelId: string) => {
      setDeletingModelId(modelId);
      try {
        await ensureNativeApi().whisper.deleteModel({ modelId });
        await queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
        if (whisperSelectedModel === modelId) {
          updateSettings({ whisperSelectedModel: null });
        }
        toastManager.add({
          title: "Model removed",
          description: `${WHISPER_MODELS.find((m) => m.id === modelId)?.label ?? modelId} has been removed.`,
          type: "success",
        });
      } catch {
        toastManager.add({
          title: "Remove failed",
          description: "Could not remove the model.",
          type: "error",
        });
      } finally {
        setDeletingModelId(null);
      }
    },
    [queryClient, whisperSelectedModel, updateSettings],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="text-sm font-medium text-foreground">Enable voice input</h3>
          <p className="text-xs text-muted-foreground">
            Use your microphone to dictate messages. Requires a local Whisper model.
          </p>
        </div>
        <Switch
          checked={voiceEnabled}
          onCheckedChange={(checked) => updateSettings({ voiceEnabled: checked })}
        />
      </div>

      {voiceEnabled && (
        <>
          <div className="space-y-3">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-foreground">Voice model</h3>
              <p className="text-xs text-muted-foreground">
                Select and install a local Whisper model for speech recognition. Larger models are
                more accurate but slower.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {WHISPER_MODELS.map((model) => {
                const isInstalled = installedModels.includes(model.id);
                const isSelected = whisperSelectedModel === model.id;
                const isDownloading = downloadingModelId === model.id;
                const isDeleting = deletingModelId === model.id;
                const progress = downloadProgress[model.id];

                return (
                  <div
                    key={model.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                      isSelected ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{model.label}</span>
                        <span className="text-xs text-muted-foreground">{model.size}</span>
                        {isInstalled && isSelected && (
                          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {model.accuracy} accuracy / {model.speed}
                      </div>
                      {isDownloading && progress !== undefined && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="ml-3 flex shrink-0 items-center gap-2">
                      {isDownloading ? (
                        <Button variant="outline" size="xs" disabled>
                          {progress !== undefined ? `${Math.round(progress)}%` : "Starting..."}
                        </Button>
                      ) : isInstalled ? (
                        <>
                          {!isSelected && (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => updateSettings({ whisperSelectedModel: model.id })}
                            >
                              Select
                            </Button>
                          )}
                          <Button
                            variant="destructive-outline"
                            size="xs"
                            onClick={() => void handleDelete(model.id)}
                            disabled={isDeleting}
                          >
                            {isDeleting ? "Removing..." : "Remove"}
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => void handleInstall(model.id)}
                        >
                          Download
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-medium text-foreground">Language</h3>
              <p className="text-xs text-muted-foreground">
                Hint the expected spoken language for better accuracy.
              </p>
            </div>
            <Select
              value={voiceLanguage}
              onValueChange={(value) => {
                if (value !== null) {
                  updateSettings({ voiceLanguage: value });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {VOICE_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-sm font-medium text-foreground">LLM cleanup</h3>
              <p className="text-xs text-muted-foreground">
                Use the active LLM to clean up transcription (fix grammar, remove filler words).
              </p>
            </div>
            <Switch
              checked={voiceLlmCleanup}
              onCheckedChange={(checked) => updateSettings({ voiceLlmCleanup: checked })}
            />
          </div>
        </>
      )}
    </div>
  );
}
