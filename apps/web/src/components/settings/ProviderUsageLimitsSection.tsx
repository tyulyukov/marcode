import { memo } from "react";
import type { ServerProvider, ServerProviderUsageWindow } from "@marcode/contracts";
import type { TimestampFormat } from "@marcode/contracts/settings";
import { cn } from "../../lib/utils";

function formatUsageLimitResetLabel(resetsAt: string, timestampFormat: TimestampFormat): string {
  const resetDate = new Date(resetsAt);
  const now = new Date();
  const diffMs = resetDate.getTime() - now.getTime();

  if (diffMs <= 0) return "now";

  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) {
    return `in ${diffMins}m`;
  }

  const diffHours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (diffHours < 24) {
    return remainingMins > 0 ? `in ${diffHours}h ${remainingMins}m` : `in ${diffHours}h`;
  }

  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    ...(timestampFormat !== "locale" ? { hour12: timestampFormat === "12-hour" } : {}),
  };
  return resetDate.toLocaleDateString(undefined, options);
}

function getProgressBarColor(remainingPercentage: number): string {
  if (remainingPercentage > 50) return "bg-emerald-500";
  if (remainingPercentage > 20) return "bg-amber-500";
  return "bg-red-500";
}

const UsageWindowBar = memo(function UsageWindowBar({
  window,
  timestampFormat,
}: {
  window: ServerProviderUsageWindow;
  timestampFormat: TimestampFormat;
}) {
  const remainingPercentage = Math.max(0, 100 - window.usedPercentage);
  const barColor = getProgressBarColor(remainingPercentage);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">{window.label}</span>
        <span className="text-[11px] text-muted-foreground">{remainingPercentage}% remaining</span>
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={window.usedPercentage}
      >
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", barColor)}
          style={{ width: `${window.usedPercentage}%` }}
        />
      </div>

      <div className="text-[11px] text-muted-foreground">
        Resets {formatUsageLimitResetLabel(window.resetsAt, timestampFormat)}
      </div>
    </div>
  );
});

export const ProviderUsageLimitsSection = memo(function ProviderUsageLimitsSection({
  provider,
  timestampFormat,
}: {
  provider: ServerProvider;
  timestampFormat: TimestampFormat;
}) {
  const windows = provider.usageLimits?.windows ?? [];
  if (windows.length === 0) return null;

  return (
    <div className="border-t border-border/60 px-4 pb-4 pt-3 sm:px-5">
      <div className="space-y-3">
        {windows.map((window) => (
          <UsageWindowBar
            key={`${window.kind}:${window.resetsAt}`}
            window={window}
            timestampFormat={timestampFormat}
          />
        ))}
      </div>
    </div>
  );
});
