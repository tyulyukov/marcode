import { QuoteIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import type { ParsedQuotedContextEntry } from "../../lib/quotedContext";

export function UserMessageQuotedContextLabel({
  contexts,
}: {
  contexts: ReadonlyArray<ParsedQuotedContextEntry>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (contexts.length === 0) return null;

  return (
    <div className="mb-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 rounded-md bg-violet-500/12 px-2 py-0.5 text-xs text-violet-300 transition-colors hover:bg-violet-500/20 dark:bg-violet-400/10 dark:text-violet-300 dark:hover:bg-violet-400/18"
      >
        <QuoteIcon className="h-3 w-3 shrink-0" />
        {contexts.length === 1
          ? (contexts[0]?.header ?? "Quoted text")
          : `Replying to ${contexts.length} selections`}
        <ChevronDownIcon
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>
      {expanded && (
        <div className="mt-1 rounded-md border border-violet-500/20 bg-violet-500/5 p-2 text-xs dark:border-violet-400/15 dark:bg-violet-400/5">
          {contexts.map((ctx, idx) => (
            <div
              key={ctx.header + String(idx)}
              className={idx > 0 ? "mt-2 border-t border-violet-500/10 pt-2" : ""}
            >
              <div className="font-medium text-violet-300/80">{ctx.header}</div>
              {ctx.body && (
                <pre className="mt-1 whitespace-pre-wrap text-muted-foreground">{ctx.body}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
