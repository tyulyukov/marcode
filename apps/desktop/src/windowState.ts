import * as FS from "node:fs";
import * as Path from "node:path";
import type { Rectangle } from "electron";
import { screen } from "electron";

export interface WindowState {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly isMaximized: boolean;
}

const DEFAULT_WIDTH = 1100;
const DEFAULT_HEIGHT = 780;

export const DEFAULT_WINDOW_STATE: WindowState = {
  x: -1,
  y: -1,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  isMaximized: false,
};

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundsVisibleOnAnyDisplay(bounds: Rectangle): boolean {
  const displays = screen.getAllDisplays();
  const minVisiblePixels = 100;

  return displays.some((display) => {
    const { x, y, width, height } = display.workArea;
    const overlapX = Math.max(
      0,
      Math.min(bounds.x + bounds.width, x + width) - Math.max(bounds.x, x),
    );
    const overlapY = Math.max(
      0,
      Math.min(bounds.y + bounds.height, y + height) - Math.max(bounds.y, y),
    );
    return overlapX * overlapY >= minVisiblePixels;
  });
}

export function resolveWindowBounds(state: WindowState): {
  x?: number;
  y?: number;
  width: number;
  height: number;
} {
  const width = state.width > 0 ? state.width : DEFAULT_WIDTH;
  const height = state.height > 0 ? state.height : DEFAULT_HEIGHT;

  if (state.x === -1 && state.y === -1) {
    return { width, height };
  }

  const bounds: Rectangle = { x: state.x, y: state.y, width, height };

  if (!boundsVisibleOnAnyDisplay(bounds)) {
    return { width, height };
  }

  return { x: state.x, y: state.y, width, height };
}

export function readWindowState(statePath: string): WindowState {
  try {
    if (!FS.existsSync(statePath)) {
      return DEFAULT_WINDOW_STATE;
    }

    const raw = FS.readFileSync(statePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const x = isValidNumber(parsed.x) ? parsed.x : DEFAULT_WINDOW_STATE.x;
    const y = isValidNumber(parsed.y) ? parsed.y : DEFAULT_WINDOW_STATE.y;
    const width = isValidNumber(parsed.width) && parsed.width > 0 ? parsed.width : DEFAULT_WINDOW_STATE.width;
    const height = isValidNumber(parsed.height) && parsed.height > 0 ? parsed.height : DEFAULT_WINDOW_STATE.height;
    const isMaximized = typeof parsed.isMaximized === "boolean" ? parsed.isMaximized : false;

    return { x, y, width, height, isMaximized };
  } catch {
    return DEFAULT_WINDOW_STATE;
  }
}

export function writeWindowState(statePath: string, state: WindowState): void {
  const directory = Path.dirname(statePath);
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, statePath);
}
