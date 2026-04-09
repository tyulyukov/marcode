import type {
  CustomNotificationSound,
  NotificationSoundMap,
  TurnNotificationMode,
} from "@marcode/contracts/settings";
import {
  BUILT_IN_SOUNDS,
  buildNotificationContent,
  reasonToEventGroup,
  type TurnNotificationTrigger,
} from "./turnNotification";

export interface TurnNotificationSettings {
  mode: TurnNotificationMode;
  soundId: string;
  customSounds: readonly CustomNotificationSound[];
  advancedSounds: boolean;
  soundMap: NotificationSoundMap;
}

export interface DispatchResult {
  toastFallbacks: TurnNotificationTrigger[];
}

let cachedAudio: HTMLAudioElement | null = null;
let cachedAudioSrc = "";

function resolveAudioSrc(
  soundId: string,
  customSounds: readonly CustomNotificationSound[],
): string | undefined {
  const builtIn = BUILT_IN_SOUNDS.find((s) => s.id === soundId);
  if (builtIn) return builtIn.src;

  const custom = customSounds.find((s) => s.id === soundId);
  return custom?.dataUrl || undefined;
}

function getAudio(src: string): HTMLAudioElement {
  if (cachedAudio && cachedAudioSrc === src) {
    return cachedAudio;
  }
  cachedAudio = new Audio(src);
  cachedAudioSrc = src;
  return cachedAudio;
}

function playSoundFromSrc(src: string): void {
  try {
    const audio = getAudio(src);
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Browser may block Audio constructor in sandboxed contexts
  }
}

function resolveSoundIdForTrigger(
  trigger: TurnNotificationTrigger,
  settings: TurnNotificationSettings,
): string {
  if (!settings.advancedSounds) return settings.soundId;
  const group = reasonToEventGroup(trigger.reason);
  return settings.soundMap[group];
}

const SILENT_NOTIFICATION_REASONS: ReadonlySet<TurnNotificationTrigger["reason"]> = new Set([
  "turn-stopped",
  "turn-interrupted",
]);

function playSoundsForTriggers(
  triggers: readonly TurnNotificationTrigger[],
  settings: TurnNotificationSettings,
): void {
  const playedSrcs = new Set<string>();
  for (const trigger of triggers) {
    if (SILENT_NOTIFICATION_REASONS.has(trigger.reason)) continue;
    const soundId = resolveSoundIdForTrigger(trigger, settings);
    const src = resolveAudioSrc(soundId, settings.customSounds);
    if (!src || playedSrcs.has(src)) continue;
    playedSrcs.add(src);
    playSoundFromSrc(src);
  }
}

function isPageActivelyFocused(): boolean {
  return document.hasFocus();
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  return Notification.requestPermission();
}

function showOsNotification(trigger: TurnNotificationTrigger): boolean {
  if (!notificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;

  const { title, body } = buildNotificationContent(trigger);

  try {
    const notification = new Notification(title, {
      body,
      tag: `marcode-turn-${trigger.threadId}`,
      icon: "/favicon.svg",
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
    };

    return true;
  } catch {
    return false;
  }
}

export function dispatchTurnNotifications(
  triggers: readonly TurnNotificationTrigger[],
  settings: TurnNotificationSettings,
): DispatchResult {
  if (settings.mode === "off" || triggers.length === 0) {
    return { toastFallbacks: [] };
  }

  if (settings.mode === "sound") {
    playSoundsForTriggers(triggers, settings);
    return { toastFallbacks: [] };
  }

  // mode === "notification"
  if (isPageActivelyFocused()) {
    return { toastFallbacks: [...triggers] };
  }

  const toastFallbacks: TurnNotificationTrigger[] = [];
  for (const trigger of triggers) {
    const sent = showOsNotification(trigger);
    if (!sent) {
      toastFallbacks.push(trigger);
    }
  }

  return { toastFallbacks };
}

export function previewSound(
  soundId: string,
  customSounds: readonly CustomNotificationSound[],
): void {
  const src = resolveAudioSrc(soundId, customSounds);
  if (!src) return;
  playSoundFromSrc(src);
}
