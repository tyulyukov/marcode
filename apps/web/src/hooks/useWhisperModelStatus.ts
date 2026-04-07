import { useQuery } from "@tanstack/react-query";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { useSettings } from "./useSettings";

const EMPTY_INSTALLED_MODELS: ReadonlyArray<string> = [];

export function useWhisperModelStatus() {
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const settings = useSettings();

  const installedModels =
    serverConfigQuery.data?.whisper?.installedModels ?? EMPTY_INSTALLED_MODELS;
  const selectedModel = settings.whisperSelectedModel ?? null;
  const modelReady = selectedModel !== null && installedModels.includes(selectedModel);

  return {
    installedModels,
    selectedModel,
    modelReady,
  };
}
