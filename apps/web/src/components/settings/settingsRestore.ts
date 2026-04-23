import { useCallback, useMemo } from "react";
import { DEFAULT_UNIFIED_SETTINGS } from "@marcode/contracts/settings";
import { Equal } from "effect";

import { ensureLocalApi, readLocalApi } from "../../localApi";
import { useTheme } from "../../hooks/useTheme";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";

type SettingsRestoreState = {
  changedSettingLabels: string[];
  restoreDefaults: () => Promise<void>;
};

function useRestoreDefaults(
  changedSettingLabels: string[],
  restore: () => void,
  onRestored?: () => void,
): SettingsRestoreState {
  const restoreDefaults = useCallback(async () => {
    if (changedSettingLabels.length === 0) return;

    const api = readLocalApi();
    const confirmed = await (api ?? ensureLocalApi()).dialogs.confirm(
      ["Restore default settings?", `This will reset: ${changedSettingLabels.join(", ")}.`].join(
        "\n",
      ),
    );
    if (!confirmed) return;

    restore();
    onRestored?.();
  }, [changedSettingLabels, onRestored, restore]);

  return {
    changedSettingLabels,
    restoreDefaults,
  };
}

export function useAppearanceSettingsRestore(onRestored?: () => void): SettingsRestoreState {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  const changedSettingLabels = useMemo(
    () => [
      ...(theme !== "system" ? ["Theme"] : []),
      ...(settings.conversationWidth !== DEFAULT_UNIFIED_SETTINGS.conversationWidth
        ? ["Conversation width"]
        : []),
      ...(settings.reduceMotion !== DEFAULT_UNIFIED_SETTINGS.reduceMotion ? ["Reduce motion"] : []),
      ...(settings.ambientGrain !== DEFAULT_UNIFIED_SETTINGS.ambientGrain ? ["Ambient grain"] : []),
      ...(settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat
        ? ["Time format"]
        : []),
      ...(settings.diffWordWrap !== DEFAULT_UNIFIED_SETTINGS.diffWordWrap
        ? ["Diff line wrapping"]
        : []),
    ],
    [
      settings.ambientGrain,
      settings.conversationWidth,
      settings.diffWordWrap,
      settings.reduceMotion,
      settings.timestampFormat,
      theme,
    ],
  );

  return useRestoreDefaults(
    changedSettingLabels,
    () => {
      setTheme("system");
      updateSettings({
        ambientGrain: DEFAULT_UNIFIED_SETTINGS.ambientGrain,
        conversationWidth: DEFAULT_UNIFIED_SETTINGS.conversationWidth,
        diffWordWrap: DEFAULT_UNIFIED_SETTINGS.diffWordWrap,
        reduceMotion: DEFAULT_UNIFIED_SETTINGS.reduceMotion,
        timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat,
      });
    },
    onRestored,
  );
}

export function useGeneralSettingsRestore(onRestored?: () => void): SettingsRestoreState {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  const isGitWritingModelDirty = !Equal.equals(
    settings.textGenerationModelSelection ?? null,
    DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection ?? null,
  );
  const areProviderSettingsDirty = !Equal.equals(
    settings.providers,
    DEFAULT_UNIFIED_SETTINGS.providers,
  );

  const changedSettingLabels = useMemo(
    () => [
      ...(settings.enableAssistantStreaming !== DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming
        ? ["Assistant output"]
        : []),
      ...(settings.defaultThreadEnvMode !== DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode
        ? ["New thread mode"]
        : []),
      ...(settings.addProjectBaseDirectory !== DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory
        ? ["Add project base directory"]
        : []),
      ...(settings.confirmThreadArchive !== DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive
        ? ["Archive confirmation"]
        : []),
      ...(settings.confirmThreadDelete !== DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete
        ? ["Delete confirmation"]
        : []),
      ...(isGitWritingModelDirty ? ["Git writing model"] : []),
      ...(areProviderSettingsDirty ? ["Providers"] : []),
    ],
    [
      areProviderSettingsDirty,
      isGitWritingModelDirty,
      settings.addProjectBaseDirectory,
      settings.confirmThreadArchive,
      settings.confirmThreadDelete,
      settings.defaultThreadEnvMode,
      settings.enableAssistantStreaming,
    ],
  );

  return useRestoreDefaults(
    changedSettingLabels,
    () => {
      updateSettings({
        addProjectBaseDirectory: DEFAULT_UNIFIED_SETTINGS.addProjectBaseDirectory,
        confirmThreadArchive: DEFAULT_UNIFIED_SETTINGS.confirmThreadArchive,
        confirmThreadDelete: DEFAULT_UNIFIED_SETTINGS.confirmThreadDelete,
        defaultThreadEnvMode: DEFAULT_UNIFIED_SETTINGS.defaultThreadEnvMode,
        enableAssistantStreaming: DEFAULT_UNIFIED_SETTINGS.enableAssistantStreaming,
        providers: DEFAULT_UNIFIED_SETTINGS.providers,
        textGenerationModelSelection: DEFAULT_UNIFIED_SETTINGS.textGenerationModelSelection,
      });
    },
    onRestored,
  );
}
