import { describe, expect, it } from "vitest";

import { retainDetectedOverflow } from "./ToolCard";

describe("retainDetectedOverflow", () => {
  it("keeps overflow visible after a later transient non-overflow measurement", () => {
    expect(retainDetectedOverflow(true, false)).toBe(true);
  });

  it("turns on overflow after it is detected", () => {
    expect(retainDetectedOverflow(false, true)).toBe(true);
  });

  it("keeps overflow hidden before it is detected", () => {
    expect(retainDetectedOverflow(false, false)).toBe(false);
  });
});
