import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";

interface GitActionsJiraChipsProps {
  /**
   * Implementing-only Jira ticket keys for the active thread (from
   * `thread.implementingJiraTicketKeys`). Server is the source of truth — the
   * chip mirrors what the auxiliary generators will see.
   */
  readonly implementingJiraTicketKeys: ReadonlyArray<string> | undefined;
}

export function GitActionsJiraChips({ implementingJiraTicketKeys }: GitActionsJiraChipsProps) {
  if (!implementingJiraTicketKeys || implementingJiraTicketKeys.length === 0) {
    return null;
  }

  const primaryKey = implementingJiraTicketKeys[0]!;
  const remainingCount = implementingJiraTicketKeys.length - 1;
  const tooltipLabel =
    implementingJiraTicketKeys.length === 1
      ? `Branch / commit / PR will reference ${primaryKey}.`
      : `Branch / commit / PR will reference: ${implementingJiraTicketKeys.join(", ")}`;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            className="bg-accent/50 hover:bg-accent text-foreground/70 mr-1 inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors"
            aria-label={tooltipLabel}
          />
        }
      >
        <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" aria-hidden="true">
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
        <span className="font-mono">{primaryKey}</span>
        {remainingCount > 0 ? <span className="text-foreground/50">+{remainingCount}</span> : null}
      </PopoverTrigger>
      <PopoverPopup tooltipStyle side="bottom" align="end">
        <div className="text-xs">
          <div className="font-medium">Auxiliary generators will reference:</div>
          <ul className="mt-1 space-y-0.5">
            {implementingJiraTicketKeys.map((key) => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
          <div className="text-muted-foreground mt-1.5 max-w-64">
            Classified by the agent at first turn from `@jira:` mentions and the user's intent.
            Reference-only mentions are filtered out — only tickets the user is actively
            implementing land here.
          </div>
        </div>
      </PopoverPopup>
    </Popover>
  );
}
