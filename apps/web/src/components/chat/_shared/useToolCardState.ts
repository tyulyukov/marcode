import { useCallback, useState } from "react";

export type ToolCardState = "collapsed" | "preview" | "expanded";

export interface UseToolCardStateOptions {
  readonly defaultState?: ToolCardState;
  readonly bodyAvailable?: boolean;
}

export interface UseToolCardStateResult {
  readonly state: ToolCardState;
  readonly toggleOpen: () => void;
  readonly expandFully: () => void;
  readonly setState: (next: ToolCardState) => void;
}

export function useToolCardState(options?: UseToolCardStateOptions): UseToolCardStateResult {
  const defaultState = options?.defaultState ?? "collapsed";
  const bodyAvailable = options?.bodyAvailable ?? true;

  const [state, setState] = useState<ToolCardState>(defaultState);

  const toggleOpen = useCallback(() => {
    setState((current) => {
      if (current === "collapsed") {
        return bodyAvailable ? "preview" : "expanded";
      }
      return "collapsed";
    });
  }, [bodyAvailable]);

  const expandFully = useCallback(() => {
    setState("expanded");
  }, []);

  return { state, toggleOpen, expandFully, setState };
}
