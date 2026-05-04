import { createHash } from "node:crypto";

const ATLASSIAN_ME_URL = "https://api.atlassian.com/me";
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;
const GENESIS_EMAIL_SUFFIXES = ["@gen.tech", "@obrio.co"] as const;

export interface VerifyJiraTokenResult {
  readonly valid: boolean;
  readonly email?: string;
  readonly isGenesis: boolean;
}

interface CachedEntry {
  readonly result: VerifyJiraTokenResult;
  readonly expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function isGenesisEmail(email: string | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return GENESIS_EMAIL_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export async function verifyJiraToken(token: string): Promise<VerifyJiraTokenResult> {
  const key = tokenHash(token);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  let result: VerifyJiraTokenResult = { valid: false, isGenesis: false };
  try {
    const response = await fetch(ATLASSIAN_ME_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (response.ok) {
      const body = (await response.json()) as { email?: unknown };
      const email = typeof body.email === "string" ? body.email : undefined;
      result = { valid: true, isGenesis: isGenesisEmail(email), ...(email ? { email } : {}) };
    }
  } catch {
    // Network failure → treat as anonymous; don't bubble up.
  }

  cache.set(key, { result, expiresAt: now + VERIFY_CACHE_TTL_MS });
  return result;
}
