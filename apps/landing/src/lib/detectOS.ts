export type DetectedOS = "mac" | "windows" | "linux" | "unknown";

export function detectOS(userAgent: string): DetectedOS {
  const ua = userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux") && !ua.includes("android")) return "linux";
  return "unknown";
}

export const OS_LABELS: Record<DetectedOS, string> = {
  mac: "macOS",
  windows: "Windows",
  linux: "Linux",
  unknown: "your platform",
};
