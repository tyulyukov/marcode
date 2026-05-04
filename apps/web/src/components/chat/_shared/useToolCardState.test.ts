import { describe, expect, it } from "vitest";

import { resolveStateAfterBodyAvailabilityChange } from "./useToolCardState";

describe("resolveStateAfterBodyAvailabilityChange", () => {
  it("opens a latest card preview when live body content arrives after mount", () => {
    expect(
      resolveStateAfterBodyAvailabilityChange({
        currentState: "collapsed",
        previousBodyAvailable: false,
        bodyAvailable: true,
        defaultState: "preview",
      }),
    ).toBe("preview");
  });

  it("does not reopen a card that already had body content", () => {
    expect(
      resolveStateAfterBodyAvailabilityChange({
        currentState: "collapsed",
        previousBodyAvailable: true,
        bodyAvailable: true,
        defaultState: "preview",
      }),
    ).toBe("collapsed");
  });

  it("does not open cards whose default state is collapsed", () => {
    expect(
      resolveStateAfterBodyAvailabilityChange({
        currentState: "collapsed",
        previousBodyAvailable: false,
        bodyAvailable: true,
        defaultState: "collapsed",
      }),
    ).toBe("collapsed");
  });
});
