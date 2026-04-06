import { useCallback, useRef, useState } from "react";
import {
  FolderIcon,
  FolderPlusIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import type { ThreadId, RuntimeMode } from "@marcode/contracts";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { readNativeApi } from "~/nativeApi";
import { newCommandId } from "~/lib/utils";
import { basenameOfPath } from "~/vscode-icons";

interface ComposerAttachmentsPopoverProps {
  threadId: ThreadId;
  additionalDirectories: readonly string[];
  onLocalDirectoriesChange?: ((directories: string[]) => void) | undefined;
  runtimeMode: RuntimeMode;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onAttachImages: (files: File[]) => void;
  disabled: boolean;
}

export function ComposerAttachmentsPopover({
  threadId,
  additionalDirectories,
  onLocalDirectoriesChange,
  runtimeMode,
  onRuntimeModeChange,
  onAttachImages,
  disabled,
}: ComposerAttachmentsPopoverProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  const count = additionalDirectories.length;

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) {
        onAttachImages(files);
      }
      e.target.value = "";
    },
    [onAttachImages],
  );

  const dispatchMetaUpdate = useCallback(
    async (nextDirs: string[]) => {
      if (onLocalDirectoriesChange) {
        onLocalDirectoriesChange(nextDirs);
        return;
      }
      const api = readNativeApi();
      if (!api) return;
      await api.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId,
        additionalDirectories: nextDirs,
      });
    },
    [threadId, onLocalDirectoriesChange],
  );

  const handlePickFolder = useCallback(async () => {
    const api = readNativeApi();
    if (!api || isPickingFolder) return;
    setIsPickingFolder(true);
    try {
      const pickedPath = await api.dialogs.pickFolder();
      if (pickedPath && !additionalDirectories.includes(pickedPath)) {
        await dispatchMetaUpdate([...additionalDirectories, pickedPath]);
      }
    } finally {
      setIsPickingFolder(false);
    }
  }, [additionalDirectories, dispatchMetaUpdate, isPickingFolder]);

  const removeDirectory = useCallback(
    (path: string) => {
      void dispatchMetaUpdate(additionalDirectories.filter((d) => d !== path));
    },
    [additionalDirectories, dispatchMetaUpdate],
  );

  return (
    <>
      <Menu>
        <MenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="relative mr-1.5 shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 sm:mr-2"
              disabled={disabled}
              aria-label="Attachments & settings"
            >
              <PlusIcon />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
                  {count}
                </span>
              )}
            </Button>
          }
        />
        <MenuPopup side="top" align="start" sideOffset={8} className="min-w-52">
          <MenuItem onClick={() => fileInputRef.current?.click()}>
            <ImageIcon />
            Attach image
          </MenuItem>

          <MenuItem onClick={() => void handlePickFolder()} disabled={isPickingFolder}>
            <FolderPlusIcon />
            Add folder
          </MenuItem>

          {additionalDirectories.length > 0 && (
            <>
              <MenuSeparator />
              {additionalDirectories.map((dirPath) => (
                <MenuItem key={dirPath} className="group" onClick={() => removeDirectory(dirPath)}>
                  <FolderIcon />
                  <span className="min-w-0 flex-1 truncate" title={dirPath}>
                    {basenameOfPath(dirPath) || dirPath}
                  </span>
                  <XIcon className="ml-auto size-3.5 opacity-50 group-data-highlighted:opacity-100" />
                </MenuItem>
              ))}
            </>
          )}

          <MenuSeparator />

          <MenuCheckboxItem
            checked={runtimeMode === "full-access"}
            variant="switch"
            onClick={() =>
              onRuntimeModeChange(
                runtimeMode === "full-access" ? "approval-required" : "full-access",
              )
            }
          >
            <span className="flex items-center gap-2">
              {runtimeMode === "full-access" ? (
                <LockOpenIcon className="-mx-0.5 size-4 shrink-0 opacity-80" />
              ) : (
                <LockIcon className="-mx-0.5 size-4 shrink-0 opacity-80" />
              )}
              Full access
            </span>
          </MenuCheckboxItem>
        </MenuPopup>
      </Menu>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
