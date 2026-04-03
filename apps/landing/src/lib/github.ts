const REPO = "tyulyukov/marcode";

export const RELEASES_URL = `https://github.com/${REPO}/releases`;

const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

export interface Release {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
}

export async function fetchLatestRelease(): Promise<Release | null> {
  const res = await fetch(API_URL, { next: { revalidate: 300 } });
  if (!res.ok) return null;

  const data = (await res.json()) as Release;
  return data?.assets ? data : null;
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
