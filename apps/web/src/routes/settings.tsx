import { RotateCcwIcon } from "lucide-react";
import { Outlet, createFileRoute, redirect, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  useAppearanceSettingsRestore,
  useGeneralSettingsRestore,
} from "../components/settings/settingsRestore";
import { Button } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

function RestoreDefaultsButton({
  changedSettingLabels,
  restoreDefaults,
}: {
  changedSettingLabels: string[];
  restoreDefaults: () => Promise<void>;
}) {
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={changedSettingLabels.length === 0}
      onClick={() => void restoreDefaults()}
    >
      <RotateCcwIcon className="size-3.5" />
      Restore defaults
    </Button>
  );
}

function SettingsContentLayout() {
  const location = useLocation();
  const [restoreSignal, setRestoreSignal] = useState(0);
  const handleRestored = () => setRestoreSignal((value) => value + 1);
  const generalRestore = useGeneralSettingsRestore(handleRestored);
  const appearanceRestore = useAppearanceSettingsRestore(handleRestored);
  const activeRestore =
    location.pathname === "/settings/general"
      ? generalRestore
      : location.pathname === "/settings/appearance"
        ? appearanceRestore
        : null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        window.history.back();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Settings</span>
              {activeRestore ? (
                <div className="ms-auto flex items-center gap-2">
                  <RestoreDefaultsButton {...activeRestore} />
                </div>
              ) : null}
            </div>
          </header>
        )}

        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5 wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Settings
            </span>
            {activeRestore ? (
              <div className="ms-auto flex items-center gap-2">
                <RestoreDefaultsButton {...activeRestore} />
              </div>
            ) : null}
          </div>
        )}

        <div key={restoreSignal} className="min-h-0 flex flex-1 flex-col">
          <Outlet />
        </div>
      </div>
    </SidebarInset>
  );
}

function SettingsRouteLayout() {
  return <SettingsContentLayout />;
}

export const Route = createFileRoute("/settings")({
  beforeLoad: ({ context, location }) => {
    if (context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/pair", replace: true });
    }

    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/general", replace: true });
    }
  },
  component: SettingsRouteLayout,
});
