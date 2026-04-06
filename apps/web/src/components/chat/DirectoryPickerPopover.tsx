import { useState } from "react";
import { FolderSymlinkIcon } from "lucide-react";
import type { ThreadId } from "@marcode/contracts";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { DirectoryPickerContent } from "./DirectoryPickerContent";

interface DirectoryPickerPopoverProps {
  threadId: ThreadId;
  projectCwd: string | null;
  additionalDirectories: readonly string[];
  disabled: boolean;
  onLocalDirectoriesChange?: ((directories: string[]) => void) | undefined;
}

export function DirectoryPickerPopover({
  threadId,
  projectCwd,
  additionalDirectories,
  disabled,
  onLocalDirectoriesChange,
}: DirectoryPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  const count = additionalDirectories.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="relative shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
            disabled={disabled}
            title="Add directories to context"
          >
            <FolderSymlinkIcon />
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
                {count}
              </span>
            )}
          </Button>
        }
      />
      <PopoverPopup side="top" align="start" sideOffset={8} className="w-80">
        <DirectoryPickerContent
          threadId={threadId}
          projectCwd={projectCwd}
          additionalDirectories={additionalDirectories}
          popoverOpen={open}
          onLocalDirectoriesChange={onLocalDirectoriesChange}
        />
      </PopoverPopup>
    </Popover>
  );
}
