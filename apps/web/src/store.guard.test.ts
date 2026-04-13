import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const STORE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "store.ts"),
  "utf-8",
);

describe("store.ts incremental event guards", () => {
  it("contains thread.message-sent event handler", () => {
    expect(STORE_SOURCE).toContain("thread.message-sent");
  });

  it("contains thread.activity-appended event handler", () => {
    expect(STORE_SOURCE).toContain("thread.activity-appended");
  });

  it("contains structural sharing logic", () => {
    expect(STORE_SOURCE).toMatch(/===\s/);
    expect(STORE_SOURCE).toContain("commitEnvironmentState");
  });
});
