import { useCallback, useRef, useState } from "react";
import { FolderIcon, FolderPlusIcon, ImageIcon, PlusIcon, XIcon } from "lucide-react";
import type { ThreadId, RuntimeMode } from "@marcode/contracts";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
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
              className="relative mr-1 shrink-0 px-2 text-muted-foreground/70 hover:text-foreground/80 sm:mr-1.5"
              disabled={disabled}
              aria-label="Attachments & settings"
            >
              <PlusIcon />
              {count > 0 && (
                <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[9px] font-medium text-white">
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

          <div className="px-2 py-1.5 font-medium text-muted-foreground text-xs">Access</div>
          <MenuRadioGroup
            value={runtimeMode}
            onValueChange={(value) => {
              if (!value || value === runtimeMode) return;
              onRuntimeModeChange(value as RuntimeMode);
            }}
          >
            <MenuRadioItem value="approval-required">Supervised</MenuRadioItem>
            <MenuRadioItem value="auto-accept-edits">Auto-accept edits</MenuRadioItem>
            <MenuRadioItem value="full-access">Full access</MenuRadioItem>
          </MenuRadioGroup>
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
