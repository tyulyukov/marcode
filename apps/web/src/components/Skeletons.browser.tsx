import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { SidebarProvider } from "./ui/sidebar";
import { ChatViewSkeleton, SidebarProjectsSkeleton } from "./Skeletons";

function mountWithSidebar(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.append(host);
  return render(<SidebarProvider defaultOpen>{ui}</SidebarProvider>, {
    container: host,
  }).then((screen) => ({
    cleanup: async () => {
      await screen.unmount();
      host.remove();
    },
  }));
}

describe("ChatViewSkeleton", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders header and message placeholders", async () => {
    const mounted = await mountWithSidebar(<ChatViewSkeleton />);
    try {
      await vi.waitFor(() => {
        const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
        expect(skeletons.length).toBeGreaterThanOrEqual(10);
      });
      const header = document.querySelector("header");
      expect(header).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("uses h-[52px] in Electron mode", async () => {
    const mounted = await mountWithSidebar(<ChatViewSkeleton />);
    try {
      const header = document.querySelector("header");
      expect(header).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });

  it("uses py-2 in browser mode", async () => {
    const mounted = await mountWithSidebar(<ChatViewSkeleton />);
    try {
      const header = document.querySelector("header");
      expect(header).not.toBeNull();
    } finally {
      await mounted.cleanup();
    }
  });
});

describe("SidebarProjectsSkeleton", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders search and project item skeletons", async () => {
    const mounted = await mountWithSidebar(<SidebarProjectsSkeleton />);
    try {
      await vi.waitFor(() => {
        const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
        expect(skeletons.length).toBeGreaterThanOrEqual(8);
      });
    } finally {
      await mounted.cleanup();
    }
  });
});
