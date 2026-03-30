import { type ProjectEntry, type ProviderKind } from "@marcode/contracts";
import { memo, useEffect, useRef } from "react";
import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { BotIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Command, CommandItem, CommandList } from "../ui/command";
import { VscodeEntryIcon } from "./VscodeEntryIcon";

export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "model";
      provider: ProviderKind;
      model: string;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "jira-task";
      issueKey: string;
      summary: string;
      status: string;
      label: string;
      description: string;
    };

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  return (
    <Command
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs">
        <CommandList className="max-h-64">
          {props.items.map((item) => (
            <ComposerCommandMenuItem
              key={item.id}
              item={item}
              resolvedTheme={props.resolvedTheme}
              isActive={props.activeItemId === item.id}
              onSelect={props.onSelect}
            />
          ))}
        </CommandList>
        {props.items.length === 0 && (
          <p className="px-3 py-2 text-muted-foreground/70 text-xs">
            {props.isLoading
              ? props.triggerKind === "slash-add-dir"
                ? "Browsing directories..."
                : "Searching..."
              : props.triggerKind === "slash-add-dir"
                ? "No matching directories."
                : props.triggerKind === "path"
                  ? "No matching results."
                  : "No matching command."}
          </p>
        )}
      </div>
    </Command>
  );
});

const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  item: ComposerCommandItem;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (props.isActive && itemRef.current) {
      itemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [props.isActive]);

  return (
    <CommandItem
      ref={itemRef}
      value={props.item.id}
      className={cn(
        "cursor-pointer select-none gap-2",
        props.isActive && "bg-accent text-accent-foreground",
      )}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <VscodeEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "slash-command" ? (
        <BotIcon className="size-4 text-muted-foreground/80" />
      ) : null}
      {props.item.type === "model" ? (
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          model
        </Badge>
      ) : null}
      {props.item.type === "jira-task" ? (
        <>
          <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none">
            <path
              d="M22.16 11.1L13.07 2.01 12 .94 4.53 8.41.84 12.1a.95.95 0 000 1.34l6.8 6.8L12 24.6l7.47-7.47.21-.21 2.48-2.48a.95.95 0 000-1.34zM12 15.53L9.25 12.8 12 10.05l2.75 2.75L12 15.53z"
              fill="#2684FF"
            />
            <path
              d="M12 10.05a4.46 4.46 0 01-.02-6.3l-5.4 5.4L9.25 11.8 12 10.05z"
              fill="#0052CC"
            />
            <path
              d="M14.77 12.78L12 15.53a4.46 4.46 0 01.02 6.3l5.38-5.38-2.63-2.67z"
              fill="#2684FF"
            />
          </svg>
          <Badge
            variant="outline"
            className="shrink-0 border-[#2684FF]/30 bg-[#2684FF]/8 px-1 py-0 text-[10px] text-[#4C9AFF]"
          >
            {props.item.issueKey}
          </Badge>
        </>
      ) : null}
      <span className="truncate">{props.item.label}</span>
      <span className="truncate text-muted-foreground/70 text-xs">{props.item.description}</span>
    </CommandItem>
  );
});
