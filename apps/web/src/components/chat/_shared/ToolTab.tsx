import { cn } from "~/lib/utils";
import { TOOL_COLORS, type ToolKind } from "./toolColors";

interface ToolTabProps {
  readonly tool: ToolKind;
  readonly label?: string;
}

export function ToolTab(props: ToolTabProps) {
  const { tool, label } = props;
  const colors = TOOL_COLORS[tool];
  const text = label ?? colors.label;

  return (
    <div className="flex">
      <span
        className={cn(
          "rounded-t-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
          colors.tabBg,
          colors.tabText,
        )}
      >
        {text}
      </span>
    </div>
  );
}
