import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { PROVIDER_DISPLAY_NAMES, type ProviderKind, type ServerProvider } from "@marcode/contracts";

import { ensureLocalApi } from "../localApi";
import { useServerProviders } from "../rpc/serverState";
import { PROVIDER_ICON_BY_PROVIDER } from "./chat/providerIconUtils";
import {
  getProviderUpdateInitialToastView,
  getSingleProviderUpdateProgressToastView,
  isProviderUpdateCandidate,
  isProviderUpdateActive,
  providerUpdateCandidateKey,
  type ProviderUpdateToastView,
} from "./ProviderUpdateLaunchNotification.logic";
import { stackedThreadToast, toastManager } from "./ui/toast";

const seenProviderUpdateNotificationKeys = new Set<string>();
type ProviderUpdateToastId = ReturnType<typeof toastManager.add>;
type ProviderUpdatePromptToast = {
  readonly key: string;
  readonly toastId: ProviderUpdateToastId;
};

function ProviderUpdateToastIcon({ provider }: { provider: ProviderKind }) {
  const ProviderIcon = PROVIDER_ICON_BY_PROVIDER[provider];

  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      <ProviderIcon aria-hidden="true" className="size-4" />
      <span className="absolute -right-1 -bottom-1 inline-flex size-3 items-center justify-center rounded-full bg-popover">
        <DownloadIcon aria-hidden="true" className="size-2.5 text-success" strokeWidth={2.5} />
      </span>
    </span>
  );
}

function addProviderUpdateToast(input: {
  readonly view: ProviderUpdateToastView;
  readonly provider: ProviderKind;
  readonly openSettings?: () => void;
}): ProviderUpdateToastId {
  const toastData = {
    leadingIcon: <ProviderUpdateToastIcon provider={input.provider} />,
    hideCopyButton: true,
  } as const;

  if (input.view.type === "loading" || input.view.type === "success") {
    return toastManager.add({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      data: toastData,
    });
  }

  return toastManager.add(
    stackedThreadToast({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      ...(input.openSettings
        ? {
            actionProps: {
              children: "Settings",
              onClick: input.openSettings,
            },
            actionVariant: "outline" as const,
          }
        : {}),
      data: toastData,
    }),
  );
}

function addProviderUpdatePromptToast(input: {
  readonly view: ProviderUpdateToastView;
  readonly provider: ProviderKind;
  readonly openSettings: () => void;
  readonly runUpdate?: () => void;
}) {
  return toastManager.add(
    stackedThreadToast({
      type: input.view.type,
      title: input.view.title,
      description: input.view.description,
      timeout: 0,
      actionProps:
        input.runUpdate !== undefined
          ? {
              children: "Update",
              onClick: input.runUpdate,
            }
          : {
              children: "Settings",
              onClick: input.openSettings,
            },
      actionVariant: input.runUpdate !== undefined ? "default" : "outline",
      data: {
        leadingIcon: <ProviderUpdateToastIcon provider={input.provider} />,
        hideCopyButton: true,
        ...(input.runUpdate !== undefined
          ? {
              secondaryActionProps: {
                children: "Settings",
                onClick: input.openSettings,
              },
              secondaryActionVariant: "outline" as const,
            }
          : {}),
      },
    }),
  );
}

function isTerminalProviderUpdateToastView(view: ProviderUpdateToastView) {
  return view.phase === "failed" || view.phase === "unchanged" || view.phase === "succeeded";
}

export function ProviderUpdateLaunchNotification() {
  const navigate = useNavigate();
  const providers = useServerProviders();
  const promptToastsRef = useRef<Map<ProviderKind, ProviderUpdatePromptToast>>(new Map());
  const previousUpdateStatusRef = useRef<ReadonlyMap<
    ProviderKind,
    NonNullable<ServerProvider["updateState"]>["status"] | null
  > | null>(null);

  const updateProviders = useMemo(() => providers.filter(isProviderUpdateCandidate), [providers]);

  const openProviderSettings = useCallback(
    (provider?: ProviderKind) => {
      if (provider !== undefined) {
        const promptToast = promptToastsRef.current.get(provider);
        if (promptToast) {
          toastManager.close(promptToast.toastId);
          promptToastsRef.current.delete(provider);
        }
      }
      void navigate({ to: "/settings/general", hash: "providers" });
    },
    [navigate],
  );

  useEffect(() => {
    const nextStatusByProvider = new Map(
      providers.map(
        (provider) => [provider.provider, provider.updateState?.status ?? null] as const,
      ),
    );
    const previousStatusByProvider = previousUpdateStatusRef.current;
    previousUpdateStatusRef.current = nextStatusByProvider;

    if (previousStatusByProvider === null) {
      return;
    }

    for (const provider of providers) {
      const previousStatus = previousStatusByProvider.get(provider.provider) ?? null;
      const nextStatus = provider.updateState?.status ?? null;
      if (previousStatus === nextStatus) {
        continue;
      }

      const view = getSingleProviderUpdateProgressToastView(provider);
      if (!isTerminalProviderUpdateToastView(view)) {
        continue;
      }
      if (previousStatus !== "queued" && previousStatus !== "running") {
        continue;
      }

      const openSettings =
        view.type === "error" || view.type === "warning"
          ? () => openProviderSettings(provider.provider)
          : undefined;
      addProviderUpdateToast({
        view,
        provider: provider.provider,
        ...(openSettings ? { openSettings } : {}),
      });
    }
  }, [providers, openProviderSettings]);

  useEffect(() => {
    const nextPromptProviders = new Set<ProviderKind>();
    const updateProviderByKind = new Map(
      updateProviders.map((provider) => [provider.provider, provider] as const),
    );

    for (const provider of updateProviders) {
      if (isProviderUpdateActive(provider)) {
        continue;
      }

      const key = providerUpdateCandidateKey(provider);
      nextPromptProviders.add(provider.provider);

      const existingToast = promptToastsRef.current.get(provider.provider);
      if (existingToast?.key === key) {
        continue;
      }
      if (existingToast) {
        toastManager.close(existingToast.toastId);
        promptToastsRef.current.delete(provider.provider);
      }
      if (seenProviderUpdateNotificationKeys.has(key)) {
        continue;
      }

      seenProviderUpdateNotificationKeys.add(key);

      const initialView = getProviderUpdateInitialToastView({
        updateProviders: [provider],
        oneClickProviders: provider.versionAdvisory.canUpdate ? [provider] : [],
      });
      const openSettings = () => openProviderSettings(provider.provider);
      let updateStarted = false;
      const runUpdate =
        provider.versionAdvisory.canUpdate === true
          ? () => {
              if (updateStarted) {
                return;
              }
              updateStarted = true;
              const promptToast = promptToastsRef.current.get(provider.provider);
              if (promptToast) {
                toastManager.close(promptToast.toastId);
                promptToastsRef.current.delete(provider.provider);
              }

              void ensureLocalApi()
                .server.updateProvider({ provider: provider.provider })
                .catch((error: unknown) => {
                  addProviderUpdateToast({
                    view: {
                      phase: "failed",
                      type: "error",
                      title: `${PROVIDER_DISPLAY_NAMES[provider.provider]} update failed`,
                      description:
                        error instanceof Error ? error.message : "Provider update failed.",
                    },
                    provider: provider.provider,
                    openSettings,
                  });
                });
            }
          : undefined;

      const toastId = addProviderUpdatePromptToast({
        view: initialView,
        provider: provider.provider,
        openSettings,
        ...(runUpdate ? { runUpdate } : {}),
      });
      promptToastsRef.current.set(provider.provider, { key, toastId });
    }

    for (const [providerKind, promptToast] of promptToastsRef.current) {
      const provider = updateProviderByKind.get(providerKind);
      const shouldKeepToast =
        provider !== undefined &&
        nextPromptProviders.has(providerKind) &&
        !isProviderUpdateActive(provider) &&
        promptToast.key === providerUpdateCandidateKey(provider);

      if (shouldKeepToast) {
        continue;
      }

      toastManager.close(promptToast.toastId);
      promptToastsRef.current.delete(providerKind);
    }
  }, [openProviderSettings, updateProviders]);

  return null;
}
