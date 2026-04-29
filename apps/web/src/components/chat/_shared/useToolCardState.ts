import { useCallback, useState } from "react";

export type ToolCardState = "collapsed" | "preview" | "expanded";

export interface UseToolCardStateOptions {
  readonly defaultState?: ToolCardState;
  readonly previewAvailable?: boolean;
}

export interface UseToolCardStateResult {
  readonly state: ToolCardState;
  readonly cycleNext: () => void;
  readonly setState: (next: ToolCardState) => void;
}

export function useToolCardState(options?: UseToolCardStateOptions): UseToolCardStateResult {
  const defaultState = options?.defaultState ?? "collapsed";
  const previewAvailable = options?.previewAvailable ?? true;

  const [state, setState] = useState<ToolCardState>(defaultState);

  const cycleNext = useCallback(() => {
    setState((current) => {
      if (current === "collapsed") return previewAvailable ? "preview" : "expanded";
      if (current === "preview") return "expanded";
      return "collapsed";
    });
  }, [previewAvailable]);

  return { state, cycleNext, setState };
}
