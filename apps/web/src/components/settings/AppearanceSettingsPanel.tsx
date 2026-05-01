import {
  type CodeFont,
  DEFAULT_UNIFIED_SETTINGS,
  type TimestampFormat,
} from "@marcode/contracts/settings";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { useTheme } from "../../hooks/useTheme";
import { THEME_REGISTRY } from "../../themes";
import { cn } from "../../lib/utils";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { ThemeCarousel } from "./ThemeCarousel";

const TIMESTAMP_FORMAT_LABELS: Record<TimestampFormat, string> = {
  locale: "System default",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
};

const CODE_FONT_LABELS: Record<CodeFont, string> = {
  system: "System default",
  "jetbrains-mono": "JetBrains Mono",
  "fira-code": "Fira Code",
  "ibm-plex-mono": "IBM Plex Mono",
};

const ACCENT_SWATCHES: ReadonlyArray<{ id: string; label: string; hex: string | null }> = [
  { id: "default", label: "Default", hex: null },
  { id: "teal", label: "Teal", hex: "#77e6e9" },
  { id: "blue", label: "Blue", hex: "#7fa1ff" },
  { id: "violet", label: "Violet", hex: "#a78bfa" },
  { id: "pink", label: "Pink", hex: "#f472b6" },
  { id: "red", label: "Red", hex: "#f87171" },
  { id: "amber", label: "Amber", hex: "#f9d647" },
  { id: "green", label: "Green", hex: "#64e194" },
];

export function AppearanceSettingsPanel() {
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();
  const { theme } = useTheme();

  const lightThemes = THEME_REGISTRY.filter((t) => t.base === "light");
  const darkThemes = THEME_REGISTRY.filter((t) => t.base === "dark");
  const isAutoNight = theme === "system";

  const isAutoNightPairDirty =
    settings.autoNightLightTheme !== DEFAULT_UNIFIED_SETTINGS.autoNightLightTheme ||
    settings.autoNightDarkTheme !== DEFAULT_UNIFIED_SETTINGS.autoNightDarkTheme;

  return (
    <SettingsPageContainer>
      <SettingsSection title="Color theme">
        <ThemeCarousel />

        {isAutoNight ? (
          <SettingsRow
            title="Auto-night pair"
            description="Pick which themes to use when the system is light or dark."
            resetAction={
              isAutoNightPairDirty ? (
                <SettingResetButton
                  label="auto-night pair"
                  onClick={() =>
                    updateSettings({
                      autoNightLightTheme: DEFAULT_UNIFIED_SETTINGS.autoNightLightTheme,
                      autoNightDarkTheme: DEFAULT_UNIFIED_SETTINGS.autoNightDarkTheme,
                    })
                  }
                />
              ) : null
            }
            control={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <ThemePairSelect
                  ariaLabel="Light theme"
                  themes={lightThemes}
                  value={settings.autoNightLightTheme}
                  onChange={(id) => updateSettings({ autoNightLightTheme: id })}
                />
                <ThemePairSelect
                  ariaLabel="Dark theme"
                  themes={darkThemes}
                  value={settings.autoNightDarkTheme}
                  onChange={(id) => updateSettings({ autoNightDarkTheme: id })}
                />
              </div>
            }
          />
        ) : null}

        <SettingsRow
          title="Accent color"
          description="Override the theme's primary swatch for buttons, badges, and highlights."
          resetAction={
            settings.accentOverride !== DEFAULT_UNIFIED_SETTINGS.accentOverride ? (
              <SettingResetButton
                label="accent color"
                onClick={() =>
                  updateSettings({ accentOverride: DEFAULT_UNIFIED_SETTINGS.accentOverride })
                }
              />
            ) : null
          }
          control={
            <AccentSwatchPicker
              value={settings.accentOverride}
              onChange={(hex) => updateSettings({ accentOverride: hex })}
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Display">
        <SettingsRow
          title="Code font"
          description="Monospace font used for code blocks, diffs, and tool output."
          resetAction={
            settings.codeFont !== DEFAULT_UNIFIED_SETTINGS.codeFont ? (
              <SettingResetButton
                label="code font"
                onClick={() => updateSettings({ codeFont: DEFAULT_UNIFIED_SETTINGS.codeFont })}
              />
            ) : null
          }
          control={
            <Select
              value={settings.codeFont}
              onValueChange={(value) => {
                if (
                  value === "system" ||
                  value === "jetbrains-mono" ||
                  value === "fira-code" ||
                  value === "ibm-plex-mono"
                ) {
                  updateSettings({ codeFont: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Code font">
                <SelectValue>{CODE_FONT_LABELS[settings.codeFont]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="system">
                  {CODE_FONT_LABELS.system}
                </SelectItem>
                <SelectItem hideIndicator value="jetbrains-mono">
                  {CODE_FONT_LABELS["jetbrains-mono"]}
                </SelectItem>
                <SelectItem hideIndicator value="fira-code">
                  {CODE_FONT_LABELS["fira-code"]}
                </SelectItem>
                <SelectItem hideIndicator value="ibm-plex-mono">
                  {CODE_FONT_LABELS["ibm-plex-mono"]}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Reduce motion"
          description="Disable transitions and animations across the app."
          resetAction={
            settings.reduceMotion !== DEFAULT_UNIFIED_SETTINGS.reduceMotion ? (
              <SettingResetButton
                label="reduce motion"
                onClick={() =>
                  updateSettings({ reduceMotion: DEFAULT_UNIFIED_SETTINGS.reduceMotion })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.reduceMotion}
              onCheckedChange={(checked) => updateSettings({ reduceMotion: Boolean(checked) })}
              aria-label="Reduce motion"
            />
          }
        />

        <SettingsRow
          title="Time format"
          description="System default follows your browser or OS clock preference."
          resetAction={
            settings.timestampFormat !== DEFAULT_UNIFIED_SETTINGS.timestampFormat ? (
              <SettingResetButton
                label="time format"
                onClick={() =>
                  updateSettings({ timestampFormat: DEFAULT_UNIFIED_SETTINGS.timestampFormat })
                }
              />
            ) : null
          }
          control={
            <Select
              value={settings.timestampFormat}
              onValueChange={(value) => {
                if (value === "locale" || value === "12-hour" || value === "24-hour") {
                  updateSettings({ timestampFormat: value });
                }
              }}
            >
              <SelectTrigger className="w-full sm:w-40" aria-label="Timestamp format">
                <SelectValue>{TIMESTAMP_FORMAT_LABELS[settings.timestampFormat]}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value="locale">
                  {TIMESTAMP_FORMAT_LABELS.locale}
                </SelectItem>
                <SelectItem hideIndicator value="12-hour">
                  {TIMESTAMP_FORMAT_LABELS["12-hour"]}
                </SelectItem>
                <SelectItem hideIndicator value="24-hour">
                  {TIMESTAMP_FORMAT_LABELS["24-hour"]}
                </SelectItem>
              </SelectPopup>
            </Select>
          }
        />

        <SettingsRow
          title="Diff line wrapping"
          description="Set the default wrap state when the diff panel opens."
          resetAction={
            settings.diffWordWrap !== DEFAULT_UNIFIED_SETTINGS.diffWordWrap ? (
              <SettingResetButton
                label="diff line wrapping"
                onClick={() =>
                  updateSettings({ diffWordWrap: DEFAULT_UNIFIED_SETTINGS.diffWordWrap })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.diffWordWrap}
              onCheckedChange={(checked) => updateSettings({ diffWordWrap: Boolean(checked) })}
              aria-label="Wrap diff lines by default"
            />
          }
        />

        <SettingsRow
          title="Chat minimap"
          description="Show a vertical minimap of your prompts on the right side of the chat."
          resetAction={
            settings.hideChatMinimap !== DEFAULT_UNIFIED_SETTINGS.hideChatMinimap ? (
              <SettingResetButton
                label="chat minimap visibility"
                onClick={() =>
                  updateSettings({ hideChatMinimap: DEFAULT_UNIFIED_SETTINGS.hideChatMinimap })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={!settings.hideChatMinimap}
              onCheckedChange={(checked) => updateSettings({ hideChatMinimap: !checked })}
              aria-label="Show chat minimap"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

function ThemePairSelect({
  ariaLabel,
  themes,
  value,
  onChange,
}: {
  ariaLabel: string;
  themes: ReadonlyArray<(typeof THEME_REGISTRY)[number]>;
  value: string;
  onChange: (id: string) => void;
}) {
  const active = themes.find((t) => t.id === value) ?? themes[0];
  const grouped = themes.reduce<Map<string, typeof themes>>((acc, t) => {
    const list = acc.get(t.group) ?? [];
    acc.set(t.group, [...list, t] as typeof themes);
    return acc;
  }, new Map());

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next);
      }}
    >
      <SelectTrigger className="w-full sm:w-44" aria-label={ariaLabel}>
        <SelectValue>{active?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        {Array.from(grouped.entries()).map(([group, groupThemes], index) => (
          <SelectGroup key={group}>
            {index > 0 ? <SelectSeparator /> : null}
            <SelectGroupLabel>{group}</SelectGroupLabel>
            {groupThemes.map((t) => (
              <SelectItem hideIndicator key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectPopup>
    </Select>
  );
}

function AccentSwatchPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ACCENT_SWATCHES.map((swatch) => {
        const isSelected = (swatch.hex ?? null) === (value ?? null);
        return (
          <button
            key={swatch.id}
            type="button"
            onClick={() => onChange(swatch.hex)}
            aria-label={`Set accent to ${swatch.label}`}
            aria-pressed={isSelected}
            className={cn(
              "size-6 rounded-full border border-border/60 outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : null,
              !swatch.hex ? "bg-card" : null,
            )}
            style={swatch.hex ? { backgroundColor: swatch.hex } : undefined}
          >
            {!swatch.hex ? (
              <span
                aria-hidden
                className="block size-full rounded-full bg-[conic-gradient(from_0deg,#77e6e9,#7fa1ff,#a78bfa,#f472b6,#f9d647,#64e194,#77e6e9)] opacity-60"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
