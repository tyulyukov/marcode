import { memo } from "react";
import { CheckIcon } from "lucide-react";
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
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
        <CheckIcon className="size-2.5" />
      </span>
    );
  }
  if (status === "inProgress") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary/60 bg-primary/15">
        <span className="size-1 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30">
      <span className="size-1 rounded-full bg-muted-foreground/30" />
    </span>
  );
}

function DeltaSection(props: {
  label: string;
  status: StepStatus;
  steps: ReadonlyArray<{ step: string }>;
}) {
  if (props.steps.length === 0) return null;
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] tracking-[0.16em] text-muted-foreground/45 uppercase">
        {props.label}
      </p>
      <div className="space-y-0.5">
        {props.steps.map((entry, index) => (
          <div key={`${index}:${entry.step}`} className="flex items-center gap-2 px-3 py-1">
            {stepStatusIcon(props.status)}
            <p
              className={cn(
                "text-[12px] leading-snug",
                props.status === "completed"
                  ? "text-muted-foreground/55 line-through decoration-muted-foreground/25"
                  : props.status === "inProgress"
                    ? "text-primary"
                    : "text-muted-foreground/70",
              )}
            >
              {entry.step}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export const PlanUpdateCard = memo(function PlanUpdateCard(props: PlanUpdateCardProps) {
  const { entry, isLatestTurn = false } = props;
  const justCompleted = entry.planJustCompletedSteps ?? [];
  const inProgress = entry.planInProgressSteps ?? [];
  const added = entry.planNewSteps ?? [];

  if (justCompleted.length === 0 && inProgress.length === 0 && added.length === 0) {
    return null;
  }

  const total = entry.planTotalCount ?? entry.planSteps?.length ?? 0;
  const completedCount =
    entry.planCompletedCount ??
    entry.planSteps?.filter((step) => step.status === "completed").length ??
    0;
  const isFirstUpdate = total > 0 && added.length === total;
  const primaryLabel = isFirstUpdate ? "Plan started" : "Plan updated";
  const addedLabel = isFirstUpdate ? "NEW PLAN" : "JUST ADDED";
  const visibleDeltaCount = justCompleted.length + inProgress.length + added.length;

  const meta = (
    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/45">
      {completedCount}/{total}
    </span>
  );

  const body = (
    <div className="px-1 py-1">
      {entry.planExplanation ? (
        <p className="px-3 pt-2 text-[12px] leading-relaxed text-muted-foreground/80">
          {entry.planExplanation}
        </p>
      ) : null}
      <DeltaSection label={addedLabel} status="pending" steps={added} />
      <DeltaSection label="JUST COMPLETED" status="completed" steps={justCompleted} />
      <DeltaSection label="NOW WORKING ON" status="inProgress" steps={inProgress} />
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
      showFullCta={visibleDeltaCount > 4}
    />
  );
});
