import { MonitorIcon, PaletteIcon, WandSparklesIcon, WrapTextIcon } from "lucide-react";
import { type CSSProperties, useMemo } from "react";
import { DEFAULT_UNIFIED_SETTINGS } from "@marcode/contracts/settings";

import { CONVERSATION_WIDTH_OPTIONS } from "../../appearance";
import { useTheme } from "../../hooks/useTheme";
import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  THEME_GROUPS,
  THEME_REGISTRY,
  resolvePreferenceFromSystem,
  type ThemeDefinition,
} from "../../themes";
import { Badge } from "../ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";

const TIMESTAMP_FORMAT_LABELS = {
  locale: "System default",
  "12-hour": "12-hour",
  "24-hour": "24-hour",
} as const;

type ThemePreviewPalette = {
  background: string;
  border: string;
  card: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  sidebar: string;
};

const DEFAULT_THEME_PREVIEW_PALETTE: Record<"light" | "dark", ThemePreviewPalette> = {
  light: {
    background: "#ffffff",
    border: "rgba(34, 34, 34, 0.08)",
    card: "#ffffff",
    foreground: "#222222",
    muted: "rgba(34, 34, 34, 0.04)",
    mutedForeground: "rgba(34, 34, 34, 0.58)",
    primary: "#265253",
    primaryForeground: "#f9fdfd",
    secondary: "rgba(34, 34, 34, 0.04)",
    sidebar: "#f6f8f8",
  },
  dark: {
    background: "#242628",
    border: "rgba(249, 253, 253, 0.1)",
    card: "#2a2d31",
    foreground: "#f9fdfd",
    muted: "rgba(249, 253, 253, 0.08)",
    mutedForeground: "rgba(249, 253, 253, 0.56)",
    primary: "#77e6e9",
    primaryForeground: "#222222",
    secondary: "rgba(249, 253, 253, 0.06)",
    sidebar: "#2b2f34",
  },
};

function resolveThemePreviewPalette(theme: ThemeDefinition): ThemePreviewPalette {
  if (!theme.variables) {
    return DEFAULT_THEME_PREVIEW_PALETTE[theme.base];
  }

  return {
    background: theme.variables["--background"],
    border: theme.variables["--border"],
    card: theme.variables["--card"],
    foreground: theme.variables["--foreground"],
    muted: theme.variables["--muted"],
    mutedForeground: theme.variables["--muted-foreground"],
    primary: theme.variables["--primary"],
    primaryForeground: theme.variables["--primary-foreground"],
    secondary: theme.variables["--secondary"],
    sidebar: theme.variables["--popover"],
  };
}

function ThemeCard({
  themeDefinition,
  selected,
  subtitle,
  badgeLabel,
  onSelect,
}: {
  themeDefinition: ThemeDefinition;
  selected: boolean;
  subtitle: string;
  badgeLabel: string;
  onSelect: () => void;
}) {
  const palette = resolveThemePreviewPalette(themeDefinition);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Use ${themeDefinition.label} theme`}
      className={cn(
        "group flex min-w-0 flex-col rounded-[22px] border p-2 text-left transition-colors",
        selected
          ? "border-primary bg-accent/30 shadow-sm"
          : "border-border/70 bg-background hover:border-border hover:bg-accent/20",
      )}
      onClick={onSelect}
    >
      <ThemePreviewSurface palette={palette} />
      <div className="flex min-w-0 items-start justify-between gap-3 px-1 pb-1 pt-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">
            {themeDefinition.label}
          </div>
          <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" size="sm">
            {badgeLabel}
          </Badge>
          {selected ? (
            <Badge variant="secondary" size="sm">
              Active
            </Badge>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function ThemePreviewSurface({ palette }: { palette: ThemePreviewPalette }) {
  const style = {
    "--theme-preview-background": palette.background,
    "--theme-preview-border": palette.border,
    "--theme-preview-card": palette.card,
    "--theme-preview-foreground": palette.foreground,
    "--theme-preview-muted": palette.muted,
    "--theme-preview-muted-foreground": palette.mutedForeground,
    "--theme-preview-primary": palette.primary,
    "--theme-preview-primary-foreground": palette.primaryForeground,
    "--theme-preview-secondary": palette.secondary,
    "--theme-preview-sidebar": palette.sidebar,
  } as CSSProperties;

  return (
    <div
      className="overflow-hidden rounded-[18px] border"
      style={{
        ...style,
        backgroundColor: "var(--theme-preview-background)",
        borderColor: "var(--theme-preview-border)",
      }}
    >
      <div className="flex h-32 overflow-hidden">
        <div
          className="flex w-10 shrink-0 flex-col gap-2 border-r px-2 py-2"
          style={{
            backgroundColor: "var(--theme-preview-sidebar)",
            borderColor: "var(--theme-preview-border)",
          }}
        >
          <div
            className="size-4 rounded-full"
            style={{ backgroundColor: "var(--theme-preview-primary)" }}
          />
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: "var(--theme-preview-muted)" }}
          />
          <div
            className="h-2 rounded-full"
            style={{ backgroundColor: "var(--theme-preview-muted)" }}
          />
          <div
            className="mt-auto h-2 rounded-full"
            style={{ backgroundColor: "var(--theme-preview-secondary)" }}
          />
        </div>
        <div
          className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3"
          style={{ backgroundColor: "var(--theme-preview-background)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-2.5 w-14 rounded-full"
              style={{ backgroundColor: "var(--theme-preview-muted)" }}
            />
            <div
              className="h-2.5 w-8 rounded-full"
              style={{ backgroundColor: "var(--theme-preview-secondary)" }}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col justify-end gap-2">
            <div
              className="ml-auto w-[72%] rounded-2xl rounded-br-md px-3 py-2"
              style={{
                backgroundColor: "var(--theme-preview-primary)",
                color: "var(--theme-preview-primary-foreground)",
              }}
            >
              <div className="h-2 rounded-full bg-current/18" />
            </div>
            <div
              className="w-[78%] rounded-2xl rounded-bl-md border px-3 py-2"
              style={{
                backgroundColor: "var(--theme-preview-card)",
                borderColor: "var(--theme-preview-border)",
              }}
            >
              <div
                className="h-2 rounded-full"
                style={{ backgroundColor: "var(--theme-preview-muted)" }}
              />
              <div
                className="mt-1.5 h-2 w-[70%] rounded-full"
                style={{ backgroundColor: "var(--theme-preview-secondary)" }}
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="h-1.5 w-8 rounded-full"
              style={{ backgroundColor: "var(--theme-preview-muted-foreground)" }}
            />
            <div
              className="h-1.5 w-5 rounded-full"
              style={{ backgroundColor: "var(--theme-preview-muted)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversationWidthCard({
  label,
  description,
  previewWidth,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  previewWidth: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`Use ${label.toLowerCase()} conversation width`}
      className={cn(
        "flex min-w-0 flex-col rounded-2xl border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-accent/30 shadow-sm"
          : "border-border/70 bg-background hover:border-border hover:bg-accent/20",
      )}
      onClick={onSelect}
    >
      <div className="rounded-xl border border-border/70 bg-muted/18 p-3">
        <div className="rounded-lg border border-border/70 bg-background/90 px-3 py-3">
          <div className="mx-auto flex flex-col gap-1.5" style={{ width: previewWidth }}>
            <div className="h-2 rounded-full bg-muted" />
            <div className="h-2 rounded-full bg-secondary" />
            <div className="h-2 rounded-full bg-muted" />
            <div className="mt-2 h-6 rounded-2xl bg-primary/15" />
          </div>
        </div>
      </div>
      <div className="pt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {selected ? (
            <Badge variant="secondary" size="sm">
              Active
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function AppearanceSettingsPanel() {
  const { theme, setTheme } = useTheme();
  const settings = useSettings();
  const { updateSettings } = useUpdateSettings();

  const systemTheme = useMemo(() => resolvePreferenceFromSystem("system"), []);
  const themesByGroup = useMemo(
    () =>
      THEME_GROUPS.map((group) => {
        const themes = THEME_REGISTRY.filter(
          (themeDefinition) => themeDefinition.group === group.group,
        );
        return {
          group: group.group,
          label: group.label,
          themes,
        };
      }).filter((group) => group.themes.length > 0),
    [],
  );

  return (
    <SettingsPageContainer contentClassName="max-w-6xl">
      <SettingsSection
        title="Themes"
        icon={<PaletteIcon className="size-3.5" />}
        headerAction={
          <Badge variant="outline" size="sm">
            {THEME_REGISTRY.length + 1} options
          </Badge>
        }
      >
        <div className="px-4 py-4 sm:px-5">
          <div className="max-w-2xl">
            <h3 className="text-sm font-medium text-foreground">Pick the whole vibe up front</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Preview each theme before you commit to it. The system option follows your current OS
              preference.
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ThemeCard
              themeDefinition={{
                id: "system",
                label: "System",
                group: "marcode",
                base: systemTheme.base,
                variables: systemTheme.variables,
              }}
              selected={theme === "system"}
              subtitle={`Follow your device. Currently ${systemTheme.label}.`}
              badgeLabel="Auto"
              onSelect={() => setTheme("system")}
            />
          </div>
        </div>

        {themesByGroup.map((group) => (
          <div key={group.group} className="border-t border-border/60 px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">{group.label}</h3>
              <Badge variant="outline" size="sm">
                {group.themes.length}
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.themes.map((themeDefinition) => (
                <ThemeCard
                  key={themeDefinition.id}
                  themeDefinition={themeDefinition}
                  selected={theme === themeDefinition.id}
                  subtitle={
                    themeDefinition.base === "dark"
                      ? "Deeper surfaces with brighter accents."
                      : "Lighter surfaces with softer contrast."
                  }
                  badgeLabel={themeDefinition.base === "dark" ? "Dark" : "Light"}
                  onSelect={() => setTheme(themeDefinition.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </SettingsSection>

      <SettingsSection title="Layout" icon={<MonitorIcon className="size-3.5" />}>
        <SettingsRow
          title="Conversation width"
          description="Control how wide the chat column, timeline, and composer can grow."
          resetAction={
            settings.conversationWidth !== DEFAULT_UNIFIED_SETTINGS.conversationWidth ? (
              <SettingResetButton
                label="conversation width"
                onClick={() =>
                  updateSettings({ conversationWidth: DEFAULT_UNIFIED_SETTINGS.conversationWidth })
                }
              />
            ) : null
          }
        >
          <div className="grid gap-3 pb-4 sm:grid-cols-3">
            {CONVERSATION_WIDTH_OPTIONS.map((option) => (
              <ConversationWidthCard
                key={option.value}
                label={option.label}
                description={option.description}
                previewWidth={option.previewWidth}
                selected={settings.conversationWidth === option.value}
                onSelect={() => updateSettings({ conversationWidth: option.value })}
              />
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Effects" icon={<WandSparklesIcon className="size-3.5" />}>
        <SettingsRow
          title="Reduce motion"
          description="Turns off reveal animations and reduces app-wide motion when you want a calmer UI."
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
          title="Ambient grain"
          description="Keep the subtle page texture, or switch it off for a cleaner flat background."
          resetAction={
            settings.ambientGrain !== DEFAULT_UNIFIED_SETTINGS.ambientGrain ? (
              <SettingResetButton
                label="ambient grain"
                onClick={() =>
                  updateSettings({ ambientGrain: DEFAULT_UNIFIED_SETTINGS.ambientGrain })
                }
              />
            ) : null
          }
          control={
            <Switch
              checked={settings.ambientGrain}
              onCheckedChange={(checked) => updateSettings({ ambientGrain: Boolean(checked) })}
              aria-label="Ambient grain"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Reading" icon={<WrapTextIcon className="size-3.5" />}>
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
      </SettingsSection>
    </SettingsPageContainer>
  );
}
