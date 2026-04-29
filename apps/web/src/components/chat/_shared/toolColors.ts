import {
  BotIcon,
  GlobeIcon,
  type LucideIcon,
  SearchIcon,
  SquarePenIcon,
  TerminalIcon,
  Trash2Icon,
  WrenchIcon,
} from "lucide-react";

export type ToolKind =
  | "bash"
  | "mcp"
  | "skill"
  | "web"
  | "file-edit"
  | "file-delete"
  | "exploration"
  | "agent";

export interface ToolColorEntry {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly tabBg: string;
  readonly tabText: string;
  readonly headerIcon: string;
}

export const TOOL_COLORS: Record<ToolKind, ToolColorEntry> = {
  bash: {
    icon: TerminalIcon,
    label: "BASH",
    tabBg: "bg-amber-400/15",
    tabText: "text-amber-400/80",
    headerIcon: "text-amber-400/60",
  },
  mcp: {
    icon: WrenchIcon,
    label: "MCP",
    tabBg: "bg-violet-400/15",
    tabText: "text-violet-400/80",
    headerIcon: "text-violet-400/60",
  },
  skill: {
    icon: WrenchIcon,
    label: "SKILL",
    tabBg: "bg-violet-400/15",
    tabText: "text-violet-400/80",
    headerIcon: "text-violet-400/60",
  },
  web: {
    icon: GlobeIcon,
    label: "WEB",
    tabBg: "bg-cyan-400/15",
    tabText: "text-cyan-400/80",
    headerIcon: "text-cyan-400/60",
  },
  "file-edit": {
    icon: SquarePenIcon,
    label: "EDIT",
    tabBg: "bg-primary/15",
    tabText: "text-primary/80",
    headerIcon: "text-primary/60",
  },
  "file-delete": {
    icon: Trash2Icon,
    label: "DELETE",
    tabBg: "bg-destructive/15",
    tabText: "text-destructive/90",
    headerIcon: "text-destructive/70",
  },
  exploration: {
    icon: SearchIcon,
    label: "EXPLORE",
    tabBg: "bg-info/15",
    tabText: "text-info/80",
    headerIcon: "text-info/60",
  },
  agent: {
    icon: BotIcon,
    label: "AGENT",
    tabBg: "bg-violet-400/15",
    tabText: "text-violet-400/80",
    headerIcon: "text-violet-400/60",
  },
};
