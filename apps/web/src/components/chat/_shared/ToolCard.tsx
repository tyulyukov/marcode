import { ChevronDownIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Collapsible, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { ApprovalBadge } from "./ApprovalBadge";
import { StatusBadge, type ToolStatusKind } from "./StatusBadge";
import { TOOL_COLORS, type ToolKind } from "./toolColors";
import { useToolCardState, type ToolCardState } from "./useToolCardState";

interface ToolCardProps {
  readonly tool: ToolKind;
  readonly status?: ToolStatusKind;
  readonly primary: ReactNode;
  readonly meta?: ReactNode;
  readonly body?: ReactNode;
  readonly expandedBody?: ReactNode;
  readonly bodyMaxPreviewPx?: number;
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

const OVERFLOW_THRESHOLD_PX = 24;

export function ToolCard(props: ToolCardProps) {
  const {
    tool,
    status,
    primary,
    meta,
    body,
    expandedBody,
    bodyMaxPreviewPx = 120,
    defaultState = "collapsed",
    isPendingApproval = false,
    statusLabels,
    hideChevron = false,
    headerClassName,
    bodyClassName,
  } = props;

  const bodyAvailable = body !== undefined && body !== null;
  const expandedBodyAvailable = expandedBody !== undefined && expandedBody !== null;
  const anyBody = bodyAvailable || expandedBodyAvailable;

  const previewAvailable = bodyAvailable;

  const [bodyOverflows, setBodyOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const hasExpandedState = expandedBodyAvailable || (bodyAvailable && bodyOverflows);

  const { state, cycleNext } = useToolCardState({
    defaultState: anyBody ? defaultState : "collapsed",
    previewAvailable,
    hasExpandedState,
  });

  useLayoutEffect(() => {
    if (!previewAvailable || expandedBodyAvailable) {
      setBodyOverflows(false);
      return;
    }
    const node = previewRef.current;
    if (!node) return;

    const measure = () => {
      const overflows = node.scrollHeight > node.clientHeight + OVERFLOW_THRESHOLD_PX;
      setBodyOverflows(overflows);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [previewAvailable, expandedBodyAvailable, body, state]);

  const colors = TOOL_COLORS[tool];
  const HeaderIcon = colors.icon;

  const showChevron = !hideChevron && anyBody;
  const isOpen = state !== "collapsed";
  const showPreview = state === "preview" && previewAvailable;
  const showExpanded = state === "expanded" && (expandedBodyAvailable || previewAvailable);

  return (
    <div
      data-scroll-anchor-target
      className={cn("overflow-hidden rounded-xl border border-border/40 bg-card/25")}
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
        {isPendingApproval ? (
          <ApprovalBadge />
        ) : status !== undefined ? (
          <StatusBadge
            status={status}
            {...(statusLabels?.running !== undefined ? { runningLabel: statusLabels.running } : {})}
            {...(statusLabels?.success !== undefined ? { successLabel: statusLabels.success } : {})}
            {...(statusLabels?.error !== undefined ? { errorLabel: statusLabels.error } : {})}
          />
        ) : null}
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
              {showPreview && bodyAvailable && (
                <div
                  ref={previewRef}
                  className="relative overflow-hidden"
                  style={{ maxHeight: `${bodyMaxPreviewPx}px` }}
                >
                  {body}
                  {bodyOverflows && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-card/90 to-transparent" />
                  )}
                </div>
              )}
              {showExpanded && (expandedBodyAvailable ? expandedBody : body)}
            </div>
          </CollapsiblePanel>
        </Collapsible>
      )}
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
