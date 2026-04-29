import { CheckIcon, CircleXIcon } from "lucide-react";
import { ApprovalBadge } from "./ApprovalBadge";

export type ToolStatusKind = "running" | "success" | "error" | "approval";

interface StatusBadgeProps {
  readonly status: ToolStatusKind;
  readonly runningLabel?: string;
  readonly successLabel?: string;
  readonly errorLabel?: string;
}

export function StatusBadge(props: StatusBadgeProps) {
  const { status, runningLabel = "Running", successLabel = "Done", errorLabel = "Failed" } = props;

  if (status === "approval") {
    return <ApprovalBadge />;
  }

  if (status === "running") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-warning-foreground/80">
        <span className="size-1.5 animate-pulse rounded-full bg-warning/80" />
        {runningLabel}
      </span>
    );
  }

  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-destructive/80">
        <CircleXIcon className="size-3" />
        {errorLabel}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-[10px] text-success-foreground/80">
      <CheckIcon className="size-3" />
      {successLabel}
    </span>
  );
}
