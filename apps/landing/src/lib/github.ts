const REPO = "tyulyukov/marcode";

export const RELEASES_URL = `https://github.com/${REPO}/releases`;

const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const CACHE_KEY = "marcode-latest-release";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export async function fetchLatestRelease(): Promise<Release> {
  if (typeof sessionStorage !== "undefined") {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Release;
  }

  const data = (await fetch(API_URL).then((r) => r.json())) as Release;

  if (data?.assets && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  }

  return data;
}

const OS_ASSET_SUFFIXES: Record<string, string> = {
  mac: "arm64.dmg",
  windows: "x64.exe",
  linux: "x86_64.AppImage",
};

export function findAssetUrl(release: Release, os: string): string | undefined {
  const suffix = OS_ASSET_SUFFIXES[os];
  if (!suffix) return undefined;

  const match = (release.assets ?? []).find((a) => a.name.endsWith(`-${suffix}`));
  return match?.browser_download_url;
}
