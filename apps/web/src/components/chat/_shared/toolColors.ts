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
  readonly headerIcon: string;
}

export const TOOL_COLORS: Record<ToolKind, ToolColorEntry> = {
  bash: {
    icon: TerminalIcon,
    headerIcon: "text-amber-400/60",
  },
  mcp: {
    icon: WrenchIcon,
    headerIcon: "text-violet-400/60",
  },
  skill: {
    icon: WrenchIcon,
    headerIcon: "text-violet-400/60",
  },
  web: {
    icon: GlobeIcon,
    headerIcon: "text-cyan-400/60",
  },
  "file-edit": {
    icon: SquarePenIcon,
    headerIcon: "text-primary/60",
  },
  "file-delete": {
    icon: Trash2Icon,
    headerIcon: "text-destructive/70",
  },
  exploration: {
    icon: SearchIcon,
    headerIcon: "text-info/60",
  },
  agent: {
    icon: BotIcon,
    headerIcon: "text-violet-400/60",
  },
};
