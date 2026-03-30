/**
 * True when running inside the Electron preload bridge, false in a regular browser.
 * The preload script sets window.nativeApi via contextBridge before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);

export function getServerHttpOrigin(): string {
  const bridgeUrl = window.desktopBridge?.getWsUrl();
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const wsUrl =
    bridgeUrl && bridgeUrl.length > 0
      ? bridgeUrl
      : envUrl && envUrl.length > 0
        ? envUrl
        : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:${window.location.port}`;
  const httpUrl = wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  try {
    return new URL(httpUrl).origin;
  } catch {
    return httpUrl;
  }
}
