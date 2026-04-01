import { useState } from "react";
import type { ParsedJiraContextEntry } from "../../lib/jiraContext";

export function UserMessageJiraContextLabel({
  contexts,
}: {
  contexts: ReadonlyArray<ParsedJiraContextEntry>;
}) {
  const [expanded, setExpanded] = useState(false);

  if (contexts.length === 0) return null;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="bg-accent/50 hover:bg-accent text-foreground/70 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors"
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none">
          <path
            d="M22.16 11.1L13.07 2.01 12 .94 4.53 8.41.84 12.1a.95.95 0 000 1.34l6.8 6.8L12 24.6l7.47-7.47.21-.21 2.48-2.48a.95.95 0 000-1.34zM12 15.53L9.25 12.8 12 10.05l2.75 2.75L12 15.53z"
            fill="#2684FF"
          />
          <path d="M12 10.05a4.46 4.46 0 01-.02-6.3l-5.4 5.4L9.25 11.8 12 10.05z" fill="#0052CC" />
          <path
            d="M14.77 12.78L12 15.53a4.46 4.46 0 01.02 6.3l5.38-5.38-2.63-2.67z"
            fill="#2684FF"
          />
        </svg>
        {contexts.length === 1
          ? (contexts[0]?.header ?? "Jira task")
          : `${contexts.length} Jira tasks`}
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 011.06 0L10 11.94l3.72-3.72a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 9.28a.75.75 0 010-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {expanded && (
        <div className="bg-muted/50 mt-1 rounded-md border p-2 text-xs">
          {contexts.map((ctx, idx) => (
            <div key={ctx.header} className={idx > 0 ? "border-t pt-2 mt-2" : ""}>
              <div className="font-medium">{ctx.header}</div>
              {ctx.body && (
                <pre className="text-muted-foreground mt-1 whitespace-pre-wrap">{ctx.body}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
