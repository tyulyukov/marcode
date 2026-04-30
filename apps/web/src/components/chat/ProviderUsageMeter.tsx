import { type ProviderUsageSnapshot } from "~/lib/providerUsage";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function formatResetTime(resetsAt: number | null): string | null {
  if (resetsAt === null) {
    return null;
  }
  const date = new Date(resetsAt * 1000);
  return `Resets ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}, ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  })}`;
}

function usageBarColor(percent: number | null): string {
  if (percent === null) {
    return "color-mix(in oklab, var(--color-muted-foreground) 45%, transparent)";
  }

  const boundedPercent = Math.min(100, Math.max(0, percent));
  if (boundedPercent < 80) {
    const progress = boundedPercent / 80;
    const hue = 186 - progress * 144;
    return `hsl(${hue} 78% 52%)`;
  }

  const progress = (boundedPercent - 80) / 20;
  const hue = 42 - progress * 34;
  return `hsl(${hue} 86% 56%)`;
}

function triggerColorClass(status: ProviderUsageSnapshot["status"]): string {
  if (status === "rejected") {
    return "text-destructive/85 hover:text-destructive";
  }
  if (status === "warning") {
    return "text-warning/85 hover:text-warning";
  }
  return "text-muted-foreground/75 hover:text-muted-foreground";
}

function UsageBar(props: { percent: number | null }) {
  const percent = props.percent ?? 0;

  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out"
        style={{
          width: `${Math.min(100, Math.max(0, percent))}%`,
          backgroundColor: usageBarColor(props.percent),
        }}
      />
    </div>
  );
}

function BarGraphIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <rect x="4" y="13" width="4" height="7" rx="1" fill="currentColor" opacity={0.45} />
      <rect x="10" y="8" width="4" height="12" rx="1" fill="currentColor" opacity={0.65} />
      <rect x="16" y="4" width="4" height="16" rx="1" fill="currentColor" opacity={0.85} />
    </svg>
  );
}

export function ProviderUsageMeter(props: { usage: ProviderUsageSnapshot }) {
  const { usage } = props;
  const reportedPercents = usage.windows
    .map((window) => window.usedPercent)
    .filter((percent): percent is number => percent !== null);
  const maxPercent = Math.max(...reportedPercents, 0);
  const hasReportedPercent = reportedPercents.length > 0;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={`group inline-flex items-center justify-center rounded-full p-0.5 transition-[color,opacity] hover:opacity-90 ${triggerColorClass(usage.status)}`}
            aria-label={
              hasReportedPercent
                ? `${usage.providerLabel} usage: ${Math.round(maxPercent)}%`
                : `${usage.providerLabel} usage`
            }
          >
            <BarGraphIcon />
          </button>
        }
      />
      <PopoverPopup tooltipStyle side="top" align="end" className="w-64 max-w-none px-4 py-3">
        <div className="space-y-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            {usage.providerLabel}
          </div>

          {usage.windows.map((window) => {
            const resetText = formatResetTime(window.resetsAt);
            return (
              <div key={window.label} className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-foreground">{window.label}</span>
                  <span className="text-xs font-semibold text-foreground">
                    {window.usedPercent !== null
                      ? `${Math.round(window.usedPercent)}%`
                      : "Usage unknown"}
                  </span>
                </div>
                <UsageBar percent={window.usedPercent} />
                {resetText ? (
                  <div className="text-[11px] text-muted-foreground">{resetText}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
