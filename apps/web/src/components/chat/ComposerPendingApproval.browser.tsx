import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { ApprovalRequestId } from "@marcode/contracts";

import { ComposerPendingApprovalPanel } from "./ComposerPendingApprovalPanel";
import { ComposerPendingApprovalActions } from "./ComposerPendingApprovalActions";

describe("ComposerPendingApprovalPanel", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function mountPanel(props: {
    requestKind: "command" | "file-read" | "file-change";
    pendingCount: number;
  }) {
    const host = document.createElement("div");
    document.body.append(host);
    const screen = await render(
      <ComposerPendingApprovalPanel
        approval={{
          requestId: ApprovalRequestId.make("test-req-1"),
          requestKind: props.requestKind,
          createdAt: new Date().toISOString(),
        }}
        pendingCount={props.pendingCount}
      />,
      { container: host },
    );
    return {
      cleanup: async () => {
        await screen.unmount();
        host.remove();
      },
    };
  }

  it("renders 'Command approval requested' for command kind", async () => {
    const mounted = await mountPanel({ requestKind: "command", pendingCount: 1 });

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("Command approval requested");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders 'File-read approval requested' for file-read kind", async () => {
    const mounted = await mountPanel({ requestKind: "file-read", pendingCount: 1 });

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("File-read approval requested");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("renders 'File-change approval requested' for file-change kind", async () => {
    const mounted = await mountPanel({ requestKind: "file-change", pendingCount: 1 });

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("File-change approval requested");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("shows '1/3' when pendingCount is 3", async () => {
    const mounted = await mountPanel({ requestKind: "command", pendingCount: 3 });

    try {
      await vi.waitFor(() => {
        expect(document.body.textContent ?? "").toContain("1/3");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("hides count when pendingCount is 1", async () => {
    const mounted = await mountPanel({ requestKind: "command", pendingCount: 1 });

    try {
      await vi.waitFor(() => {
        const text = document.body.textContent ?? "";
        expect(text).toContain("Command approval requested");
        expect(text).not.toContain("1/1");
      });
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("ComposerPendingApprovalActions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  async function mountActions(props: { isResponding: boolean }) {
    const host = document.createElement("div");
    document.body.append(host);
    const onRespondToApproval = vi.fn(() => Promise.resolve());
    const screen = await render(
      <ComposerPendingApprovalActions
        requestId={ApprovalRequestId.make("test-req-1")}
        isResponding={props.isResponding}
        onRespondToApproval={onRespondToApproval}
      />,
      { container: host },
    );
    return {
      onRespondToApproval,
      cleanup: async () => {
        await screen.unmount();
        host.remove();
      },
    };
  }

  it("renders all 4 buttons", async () => {
    const mounted = await mountActions({ isResponding: false });

    try {
      await vi.waitFor(() => {
        const text = document.body.textContent ?? "";
        expect(text).toContain("Cancel turn");
        expect(text).toContain("Decline");
        expect(text).toContain("Always allow this session");
        expect(text).toContain("Approve once");
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("disables all buttons when isResponding is true", async () => {
    const mounted = await mountActions({ isResponding: true });

    try {
      await vi.waitFor(() => {
        const buttons = document.querySelectorAll("button");
        expect(buttons.length).toBe(4);
        for (const button of buttons) {
          expect(button.disabled).toBe(true);
        }
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("calls onRespondToApproval with 'accept' when Approve once is clicked", async () => {
    const mounted = await mountActions({ isResponding: false });

    try {
      await page.getByRole("button", { name: "Approve once" }).click();

      expect(mounted.onRespondToApproval).toHaveBeenCalledWith(
        ApprovalRequestId.make("test-req-1"),
        "accept",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("calls onRespondToApproval with 'decline' when Decline is clicked", async () => {
    const mounted = await mountActions({ isResponding: false });

    try {
      await page.getByRole("button", { name: "Decline" }).click();

      expect(mounted.onRespondToApproval).toHaveBeenCalledWith(
        ApprovalRequestId.make("test-req-1"),
        "decline",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("calls onRespondToApproval with 'acceptForSession' when Always allow this session is clicked", async () => {
    const mounted = await mountActions({ isResponding: false });

    try {
      await page.getByRole("button", { name: "Always allow this session" }).click();

      expect(mounted.onRespondToApproval).toHaveBeenCalledWith(
        ApprovalRequestId.make("test-req-1"),
        "acceptForSession",
      );
    } finally {
      await mounted.cleanup();
    }
  });

  it("calls onRespondToApproval with 'cancel' when Cancel turn is clicked", async () => {
    const mounted = await mountActions({ isResponding: false });

    try {
      await page.getByRole("button", { name: "Cancel turn" }).click();

      expect(mounted.onRespondToApproval).toHaveBeenCalledWith(
        ApprovalRequestId.make("test-req-1"),
        "cancel",
      );
    } finally {
      await mounted.cleanup();
    }
  });
});
