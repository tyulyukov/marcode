import { RotateCcwIcon } from "lucide-react";
import {
  Outlet,
  createFileRoute,
  redirect,
  useCanGoBack,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import {
  type SettingsRestoreScope,
  useSettingsRestore,
} from "../components/settings/SettingsPanels";
import { Button } from "../components/ui/button";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { isElectron } from "../env";

const RESTORE_SCOPE_BY_PATHNAME: Record<string, SettingsRestoreScope> = {
  "/settings/general": "general",
  "/settings/appearance": "appearance",
};

function RestoreDefaultsButton({
  scope,
  onRestored,
}: {
  scope: SettingsRestoreScope;
  onRestored: () => void;
}) {
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore(scope, onRestored);

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
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const [restoreSignal, setRestoreSignal] = useState(0);
  const restoreScope = RESTORE_SCOPE_BY_PATHNAME[location.pathname] ?? null;
  const handleRestored = () => setRestoreSignal((value) => value + 1);
  const navigateBackWithinApp = useCallback(() => {
    if (canGoBack) {
      window.history.back();
      return;
    }
    void navigate({ to: "/" });
  }, [canGoBack, navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        navigateBackWithinApp();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [navigateBackWithinApp]);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!isElectron && (
          <header className="border-b border-border px-3 py-2 sm:px-5">
            <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
              <SidebarTrigger className="size-7 shrink-0 md:hidden" />
              <span className="text-sm font-medium text-foreground">Settings</span>
              {restoreScope ? (
                <div className="ms-auto flex items-center gap-2">
                  <RestoreDefaultsButton scope={restoreScope} onRestored={handleRestored} />
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
            {restoreScope ? (
              <div className="ms-auto flex items-center gap-2">
                <RestoreDefaultsButton scope={restoreScope} onRestored={handleRestored} />
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
