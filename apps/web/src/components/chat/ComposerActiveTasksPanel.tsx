import { memo, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  ListTodoIcon,
  LoaderIcon,
} from "lucide-react";
import { type TodoItem } from "../../session-logic";
import { cn } from "~/lib/utils";

function buildTodoSummaryLabel(items: ReadonlyArray<TodoItem>): string {
  const completed = items.filter((t) => t.status === "completed").length;
  return `${completed}/${items.length} completed`;
}

function todoStatusIcon(status: TodoItem["status"]) {
  switch (status) {
    case "completed":
      return <CheckCircle2Icon className="size-3.5 text-success" />;
    case "in_progress":
      return <LoaderIcon className="size-3.5 animate-spin text-primary/80" />;
    case "pending":
      return <CircleIcon className="size-3.5 text-muted-foreground/40" />;
  }
}

const TodoItemRow = memo(function TodoItemRow(props: { item: TodoItem }) {
  const { item } = props;
  const isCompleted = item.status === "completed";
  const isInProgress = item.status === "in_progress";
  const label = isInProgress ? item.activeForm : item.content;

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="mt-px flex shrink-0 items-center justify-center">
        {todoStatusIcon(item.status)}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 text-[11px] leading-5",
          isCompleted ? "text-muted-foreground/50 line-through" : "text-foreground/80",
        )}
      >
        {label}
      </span>
    </div>
  );
});

export const ComposerTodoListPanel = memo(function ComposerTodoListPanel(props: {
  items: ReadonlyArray<TodoItem>;
}) {
  const { items } = props;
  const [expanded, setExpanded] = useState(true);
  const allCompleted = items.every((t) => t.status === "completed");
  const ExpandIcon = expanded ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div className="px-4 py-3 sm:px-5">
      <button
        type="button"
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left transition-colors duration-150 hover:bg-muted/20"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          {allCompleted ? (
            <CheckCircle2Icon className="size-3.5 text-success" aria-hidden="true" />
          ) : (
            <ListTodoIcon className="size-3.5 text-primary/80" aria-hidden="true" />
          )}
        </span>
        <span className="flex-1 text-[11px] leading-5 text-foreground/80">
          Todos — {buildTodoSummaryLabel(items)}
        </span>
        <ExpandIcon className="size-3 shrink-0 text-muted-foreground/50" aria-hidden="true" />
      </button>

      {expanded && (
        <div className="mt-1 space-y-0.5 pl-5">
          {items.map((item) => (
            <TodoItemRow key={item.content} item={item} />
          ))}
        </div>
      )}
    </div>
  );
});
