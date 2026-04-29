import { useCallback, useEffect, useState } from "react";

export type ToolCardState = "collapsed" | "preview" | "expanded";

export interface UseToolCardStateOptions {
  readonly defaultState?: ToolCardState;
  readonly previewAvailable?: boolean;
  readonly hasExpandedState?: boolean;
}

export interface UseToolCardStateResult {
  readonly state: ToolCardState;
  readonly cycleNext: () => void;
  readonly setState: (next: ToolCardState) => void;
}

export function useToolCardState(options?: UseToolCardStateOptions): UseToolCardStateResult {
  const defaultState = options?.defaultState ?? "collapsed";
  const previewAvailable = options?.previewAvailable ?? true;
  const hasExpandedState = options?.hasExpandedState ?? true;

  const [state, setState] = useState<ToolCardState>(defaultState);

  useEffect(() => {
    if (state === "expanded" && !hasExpandedState) {
      setState(previewAvailable ? "preview" : "collapsed");
    }
  }, [state, hasExpandedState, previewAvailable]);

  const cycleNext = useCallback(() => {
    setState((current) => {
      if (current === "collapsed") {
        if (previewAvailable) return "preview";
        return hasExpandedState ? "expanded" : "collapsed";
      }
      if (current === "preview") {
        return hasExpandedState ? "expanded" : "collapsed";
      }
      return "collapsed";
    });
  }, [previewAvailable, hasExpandedState]);

  return { state, cycleNext, setState };
}
