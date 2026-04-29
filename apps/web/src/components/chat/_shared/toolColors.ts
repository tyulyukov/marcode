import {
  BotIcon,
  GlobeIcon,
  ListTodoIcon,
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
  | "agent"
  | "plan";

export const TOOL_ICONS: Record<ToolKind, LucideIcon> = {
  bash: TerminalIcon,
  mcp: WrenchIcon,
  skill: WrenchIcon,
  web: GlobeIcon,
  "file-edit": SquarePenIcon,
  "file-delete": Trash2Icon,
  exploration: SearchIcon,
  agent: BotIcon,
  plan: ListTodoIcon,
};
