export type ThemeVariables = {
  "--background": string;
  "--foreground": string;
  "--card": string;
  "--card-foreground": string;
  "--popover": string;
  "--popover-foreground": string;
  "--primary": string;
  "--primary-foreground": string;
  "--secondary": string;
  "--secondary-foreground": string;
  "--muted": string;
  "--muted-foreground": string;
  "--accent": string;
  "--accent-foreground": string;
  "--destructive": string;
  "--destructive-foreground": string;
  "--border": string;
  "--input": string;
  "--ring": string;
  "--info": string;
  "--info-foreground": string;
  "--success": string;
  "--success-foreground": string;
  "--warning": string;
  "--warning-foreground": string;
};

export type ThemeBase = "light" | "dark";

export type ThemeGroup =
  | "marcode"
  | "catppuccin"
  | "solarized"
  | "dracula"
  | "nord"
  | "one-dark"
  | "github"
  | "gruvbox"
  | "tokyo-night"
  | "rose-pine"
  | "ayu"
  | "monokai";

export type ThemeDefinition = {
  id: string;
  label: string;
  group: ThemeGroup;
  base: ThemeBase;
  variables: ThemeVariables | null;
};

export type ThemePreference = "system" | (string & {});
