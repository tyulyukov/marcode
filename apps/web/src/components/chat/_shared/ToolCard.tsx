import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Collapsible, CollapsiblePanel } from "~/components/ui/collapsible";
import { cn } from "~/lib/utils";
import { ApprovalBadge } from "./ApprovalBadge";
import { StatusBadge, type ToolStatusKind } from "./StatusBadge";
import { TOOL_ICONS, type ToolKind } from "./toolColors";
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
  readonly showFullCta?: boolean;
  readonly headerClassName?: string;
  readonly bodyClassName?: string;
}

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
    showFullCta = false,
    headerClassName,
    bodyClassName,
  } = props;

  const bodyAvailable = body !== undefined && body !== null;
  const expandedBodyAvailable = expandedBody !== undefined && expandedBody !== null;
  const anyBody = bodyAvailable || expandedBodyAvailable;

  const [bodyOverflows, setBodyOverflows] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  const { state, toggleOpen, expandFully, setState } = useToolCardState({
    defaultState: anyBody ? defaultState : "collapsed",
    bodyAvailable,
  });

  useLayoutEffect(() => {
    if (state !== "preview" || !bodyAvailable) {
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
  }, [state, bodyAvailable, body]);

  const HeaderIcon = TOOL_ICONS[tool];

  const showChevron = !hideChevron && anyBody;
  const isOpen = state !== "collapsed";

  const showPreview = state === "preview" && bodyAvailable;
  const showExpanded = state === "expanded" && (expandedBodyAvailable || bodyAvailable);
  const showFullCtaVisible = showPreview && (showFullCta || bodyOverflows || expandedBodyAvailable);

  return (
    <div
      data-scroll-anchor-target
      className={cn("overflow-hidden rounded-xl border border-border/40 bg-card/25")}
    >
      <HeaderRow
        showChevron={showChevron}
        state={state}
        onClick={showChevron ? toggleOpen : undefined}
        {...(headerClassName !== undefined ? { headerClassName } : {})}
      >
        <HeaderIcon className="size-3.5 shrink-0 text-primary/60" />
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
              isOpen ? "rotate-0" : "-rotate-90",
            )}
          />
        )}
      </HeaderRow>
      {anyBody && (
        <Collapsible open={isOpen}>
          <CollapsiblePanel>
            <div className={cn("border-t border-border/20", bodyClassName)}>
              {showPreview && bodyAvailable && (
                <div className="relative">
                  <div
                    ref={previewRef}
                    className="overflow-hidden"
                    style={{ maxHeight: `${bodyMaxPreviewPx}px` }}
                  >
                    {body}
                  </div>
                  {showFullCtaVisible && <ShowFullButton onClick={expandFully} />}
                </div>
              )}
              {showExpanded && (
                <>
                  {expandedBodyAvailable ? expandedBody : body}
                  {bodyAvailable && (
                    <HideButton onClick={() => setState(bodyAvailable ? "preview" : "collapsed")} />
                  )}
                </>
              )}
            </div>
          </CollapsiblePanel>
        </Collapsible>
      )}
    </div>
  );
}

function ShowFullButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-scroll-anchor-ignore
      onClick={onClick}
      className={cn(
        "group absolute inset-x-0 bottom-0 z-10 cursor-pointer",
        "h-14 pb-2",
        "flex items-end justify-center",
        "bg-gradient-to-t from-card via-card/70 via-55% to-transparent",
        "transition-[background-image] duration-200",
        "hover:from-card hover:via-card hover:via-35%",
      )}
      aria-label="Show full content"
    >
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] tracking-wide",
          "text-muted-foreground/40 transition-colors duration-200",
          "group-hover:text-muted-foreground/80",
        )}
      >
        <ChevronDownIcon className="size-3 transition-transform duration-200 group-hover:translate-y-[1px]" />
        Show full
      </span>
    </button>
  );
}

function HideButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-scroll-anchor-ignore
      onClick={onClick}
      className={cn(
        "group flex w-full cursor-pointer items-center justify-center",
        "border-t border-border/15 pt-1.5 pb-2",
        "transition-colors duration-200",
      )}
      aria-label="Show less"
    >
      <span
        className={cn(
          "flex items-center gap-1 text-[10px] tracking-wide",
          "text-muted-foreground/40 transition-colors duration-200",
          "group-hover:text-muted-foreground/80",
        )}
      >
        <ChevronUpIcon className="size-3 transition-transform duration-200 group-hover:-translate-y-[1px]" />
        Show less
      </span>
    </button>
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
