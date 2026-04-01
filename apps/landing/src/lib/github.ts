const REPO = "tyulyukov/marcode";

export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

export function getDownloadUrl(os: string): string {
  switch (os) {
    case "mac":
      return `${RELEASES_URL}/download/MarCode-arm64.dmg`;
    case "windows":
      return `${RELEASES_URL}/download/MarCode-Setup-x64.exe`;
    case "linux":
      return `${RELEASES_URL}/download/MarCode-x64.AppImage`;
    default:
      return RELEASES_URL;
  }
}
