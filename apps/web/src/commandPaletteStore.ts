import { create } from "zustand";

type CommandPaletteOpenIntent =
  | { kind: "add-project"; requestId: number }
  | { kind: "add-folder"; requestId: number; initialPath: string };

interface AddFolderResult {
  requestId: number;
  path: string;
}

interface CommandPaletteStore {
  open: boolean;
  openIntent: CommandPaletteOpenIntent | null;
  addFolderResult: AddFolderResult | null;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  openAddProject: () => void;
  openAddFolder: (initialPath: string) => number;
  reportAddFolderResult: (requestId: number, path: string) => void;
  consumeAddFolderResult: (requestId: number) => void;
  clearOpenIntent: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  open: false,
  openIntent: null,
  addFolderResult: null,
  setOpen: (open) => set({ open, ...(open ? {} : { openIntent: null }) }),
  toggleOpen: () =>
    set((state) => ({ open: !state.open, ...(state.open ? { openIntent: null } : {}) })),
  openAddProject: () =>
    set((state) => ({
      open: true,
      openIntent: {
        kind: "add-project",
        requestId: (state.openIntent?.requestId ?? 0) + 1,
      },
    })),
  openAddFolder: (initialPath) => {
    const nextRequestId = (get().openIntent?.requestId ?? 0) + 1;
    set({
      open: true,
      openIntent: { kind: "add-folder", requestId: nextRequestId, initialPath },
    });
    return nextRequestId;
  },
  reportAddFolderResult: (requestId, path) => set({ addFolderResult: { requestId, path } }),
  consumeAddFolderResult: (requestId) =>
    set((state) =>
      state.addFolderResult?.requestId === requestId ? { addFolderResult: null } : state,
    ),
  clearOpenIntent: () => set({ openIntent: null }),
}));
