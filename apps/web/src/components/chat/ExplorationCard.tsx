import { ChevronDownIcon, ChevronRightIcon, EyeIcon, SearchIcon } from "lucide-react";
import { memo, useState } from "react";
import { cn } from "~/lib/utils";
import type { WorkLogEntry } from "../../session-logic";

interface ExplorationCardProps {
  entries: ReadonlyArray<WorkLogEntry>;
  isLive: boolean;
}

const READ_LABEL_RE = /^Read\b/i;

function isReadEntry(entry: WorkLogEntry): boolean {
  return entry.requestKind === "file-read" || READ_LABEL_RE.test(entry.toolTitle ?? entry.label);
}

function explorationEntryHeading(entry: WorkLogEntry): string {
  const raw = (entry.toolTitle ?? entry.label).trim();
  if (raw.length === 0) return "Explored";
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
}

function ExplorationEntryRow(props: { entry: WorkLogEntry }) {
  const { entry } = props;
  const isRead = isReadEntry(entry);
  const Icon = isRead ? EyeIcon : SearchIcon;
  const heading = explorationEntryHeading(entry);
  const preview = entry.detail;

  return (
    <div className="flex items-center gap-2 rounded-lg px-1 py-0.5">
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground/50">
        <Icon className="size-3" />
      </span>
      <p className="min-w-0 flex-1 truncate text-[11px] leading-5 text-muted-foreground/70">
        <span className="text-foreground/70">{heading}</span>
        {preview && <span className="text-muted-foreground/45"> — {preview}</span>}
      </p>
    </div>
  );
}

export const ExplorationCard = memo(function ExplorationCard(props: ExplorationCardProps) {
  const { entries, isLive } = props;
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const readCount = entries.filter(isReadEntry).length;
  const searchCount = entries.length - readCount;

  const headerParts: string[] = [];
  if (readCount > 0) headerParts.push(`${readCount} file${readCount !== 1 ? "s" : ""}`);
  if (searchCount > 0) headerParts.push(`${searchCount} search${searchCount !== 1 ? "es" : ""}`);
  const summary = headerParts.join(", ");

  const verb = isLive ? "Exploring" : "Explored";
  const ToggleIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div
      data-scroll-anchor-target
      className={cn(
        "overflow-hidden rounded-xl border border-border/40 border-l-2 bg-card/25",
        isLive ? "border-l-blue-400/40" : "border-l-blue-400/20",
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors duration-100 hover:bg-muted/20"
      >
        <ToggleIcon className="size-3 shrink-0 text-muted-foreground/50" />
        <SearchIcon className="size-3.5 shrink-0 text-blue-400/50" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">
          {verb} {summary}
        </span>
        {isLive && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-blue-400/60" />}
      </button>

      {expanded && (
        <div className="border-t border-border/20 px-2 py-1">
          {entries.map((entry) => (
            <ExplorationEntryRow key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
});
