import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Collapsible, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { StatusBadge, type ToolStatusKind } from "./StatusBadge";
import { ToolTab } from "./ToolTab";
import { TOOL_COLORS, type ToolKind } from "./toolColors";
import { useToolCardState, type ToolCardState } from "./useToolCardState";

interface ToolCardProps {
  readonly tool: ToolKind;
  readonly status: ToolStatusKind;
  readonly tabLabel?: string;
  readonly primary: ReactNode;
  readonly meta?: ReactNode;
  readonly preview?: ReactNode;
  readonly expanded?: ReactNode;
  readonly defaultState?: ToolCardState;
  readonly isPendingApproval?: boolean;
  readonly statusLabels?: {
    readonly running?: string;
    readonly success?: string;
    readonly error?: string;
  };
  readonly hideChevron?: boolean;
  readonly headerClassName?: string;
  readonly bodyClassName?: string;
}

const CHEVRON_ROTATION: Record<ToolCardState, string> = {
  collapsed: "rotate-0",
  preview: "rotate-90",
  expanded: "rotate-180",
};

export function ToolCard(props: ToolCardProps) {
  const {
    tool,
    status,
    tabLabel,
    primary,
    meta,
    preview,
    expanded,
    defaultState = "collapsed",
    isPendingApproval = false,
    statusLabels,
    hideChevron = false,
    headerClassName,
    bodyClassName,
  } = props;

  const previewAvailable = preview !== undefined && preview !== null;
  const expandedAvailable = expanded !== undefined && expanded !== null;
  const anyBody = previewAvailable || expandedAvailable;

  const { state, cycleNext } = useToolCardState({
    defaultState: anyBody ? defaultState : "collapsed",
    previewAvailable,
  });

  const colors = TOOL_COLORS[tool];
  const HeaderIcon = colors.icon;

  const effectiveStatus: ToolStatusKind = isPendingApproval ? "approval" : status;
  const showChevron = !hideChevron && anyBody;
  const isOpen = state !== "collapsed";
  const showPreview = state === "preview" && previewAvailable;
  const showExpanded = state === "expanded" && (expandedAvailable || previewAvailable);

  return (
    <div data-scroll-anchor-target className="flex flex-col">
      <ToolTab tool={tool} {...(tabLabel !== undefined ? { label: tabLabel } : {})} />
      <div
        className={cn(
          "overflow-hidden rounded-tl-none rounded-tr-xl rounded-b-xl border border-border/40 bg-card/25",
        )}
      >
        <HeaderRow
          showChevron={showChevron}
          state={state}
          onClick={showChevron ? cycleNext : undefined}
          {...(headerClassName !== undefined ? { headerClassName } : {})}
        >
          <HeaderIcon className={cn("size-3.5 shrink-0", colors.headerIcon)} />
          <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/80">{primary}</span>
          {meta}
          <StatusBadge
            status={effectiveStatus}
            {...(statusLabels?.running !== undefined ? { runningLabel: statusLabels.running } : {})}
            {...(statusLabels?.success !== undefined ? { successLabel: statusLabels.success } : {})}
            {...(statusLabels?.error !== undefined ? { errorLabel: statusLabels.error } : {})}
          />
          {showChevron && (
            <ChevronDownIcon
              className={cn(
                "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
                CHEVRON_ROTATION[state],
              )}
            />
          )}
        </HeaderRow>
        {anyBody && (
          <Collapsible open={isOpen}>
            <CollapsiblePanel>
              <div className={cn("border-t border-border/20", bodyClassName)}>
                {showPreview && preview}
                {showExpanded && (expandedAvailable ? expanded : preview)}
              </div>
            </CollapsiblePanel>
          </Collapsible>
        )}
      </div>
    </div>
  );
}

interface HeaderRowProps {
  readonly showChevron: boolean;
  readonly state: ToolCardState;
  readonly onClick: (() => void) | undefined;
  readonly headerClassName?: string;
  readonly children: ReactNode;
}

function HeaderRow(props: HeaderRowProps) {
  const { showChevron, state, onClick, headerClassName, children } = props;

  if (showChevron && onClick) {
    return (
      <button
        type="button"
        data-scroll-anchor-ignore
        data-state={state}
        onClick={onClick}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors duration-100 hover:bg-muted/20 focus-visible:bg-muted/20 focus-visible:outline-none",
          headerClassName,
        )}
      >
        {children}
      </button>
    );
  }

  return (
    <div data-state={state} className={cn("flex items-center gap-2 px-3 py-2", headerClassName)}>
      {children}
    </div>
  );
}
