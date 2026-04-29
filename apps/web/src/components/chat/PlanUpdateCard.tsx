import { memo } from "react";
import { CheckIcon, LoaderIcon } from "lucide-react";
import type { WorkLogEntry } from "../../session-logic";
import { cn } from "~/lib/utils";
import { ToolCard } from "./_shared/ToolCard";

interface PlanUpdateCardProps {
  entry: WorkLogEntry;
  isLatestTurn?: boolean;
}

type StepStatus = "pending" | "inProgress" | "completed";

function stepStatusIcon(status: StepStatus) {
  if (status === "completed") {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckIcon className="size-2.5" />
      </span>
    );
  }
  if (status === "inProgress") {
    return (
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-400">
        <LoaderIcon className="size-2.5 animate-spin" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
      <span className="size-1 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

export const PlanUpdateCard = memo(function PlanUpdateCard(props: PlanUpdateCardProps) {
  const { entry, isLatestTurn = false } = props;
  const steps = entry.planSteps ?? [];

  if (steps.length === 0) return null;

  const completedCount = steps.filter((step) => step.status === "completed").length;
  const total = steps.length;
  const allPending = steps.every((step) => step.status === "pending");
  const primaryLabel = allPending ? "Plan updated" : "Plan progress";

  const meta = (
    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
      {completedCount}/{total}
    </span>
  );

  const body = (
    <div className="px-1 py-1">
      {entry.planExplanation ? (
        <p className="px-3 pt-1 pb-2 text-[12px] leading-relaxed text-muted-foreground/75">
          {entry.planExplanation}
        </p>
      ) : null}
      <div className="space-y-0.5">
        {steps.map((step, index) => (
          <div
            key={`${index}:${step.status}:${step.step}`}
            className="flex items-start gap-2 px-3 py-1.5"
          >
            {stepStatusIcon(step.status)}
            <p
              className={cn(
                "text-[12px] leading-snug",
                step.status === "completed"
                  ? "text-muted-foreground/55 line-through decoration-muted-foreground/25"
                  : step.status === "inProgress"
                    ? "text-foreground/90"
                    : "text-muted-foreground/70",
              )}
            >
              {step.step}
            </p>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <ToolCard
      tool="plan"
      primary={primaryLabel}
      meta={meta}
      body={body}
      defaultState={isLatestTurn ? "preview" : "collapsed"}
      bodyMaxPreviewPx={240}
    />
  );
});
