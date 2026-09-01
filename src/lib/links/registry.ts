/**
 * Steam-account -> Twitch-channel links known to Streamlock itself, with
 * provenance so callers can rank them against Statlocker's self-reported field.
 *
 * Two sources, in increasing order of trust:
 *   1. "manual"   — data/twitch-links.json, or the STREAMLOCK_TWITCH_LINKS env
 *                   var containing the same `{ "<accountId>": "<login>" }` shape.
 *                   Operator-supplied; handy before a Statlocker key is approved.
 *   2. "verified" — written by the linking flow after the user proved ownership
 *                   of both the Steam account (OpenID) and the channel (OAuth).
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import { TTL, cached } from "@/lib/cache";
import { getLinkStore } from "@/lib/links/store";
import { normaliseTwitchLogin } from "@/lib/twitch/vod";

export type LinkSource = "manual" | "verified";

export interface RegistryLink {
  login: string;
  source: LinkSource;
  displayName: string | null;
}

const MANUAL_PATH = path.join(process.cwd(), "data", "twitch-links.json");

function parseManualEntries(raw: unknown): Map<number, string> {
  const links = new Map<number, string>();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return links;

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const accountId = Number(key);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) continue;
    const login = normaliseTwitchLogin(typeof value === "string" ? value : null);
    if (login) links.set(accountId, login);
  }
  return links;
}

async function loadManualFromFile(): Promise<Map<number, string>> {
  try {
    return parseManualEntries(JSON.parse(await readFile(MANUAL_PATH, "utf8")));
  } catch {
    return new Map();
  }
}

function loadManualFromEnv(): Map<number, string> {
  const raw = process.env.STREAMLOCK_TWITCH_LINKS?.trim();
  if (!raw) return new Map();
  try {
    return parseManualEntries(JSON.parse(raw));
  } catch {
    return new Map();
  }
}

/**
 * Cached, and invalidated by the link store on write (see `store.ts`), so a
 * freshly linked account shows up immediately.
 */
export async function getTwitchLinks(): Promise<Map<number, RegistryLink>> {
  return cached("links:all", TTL.profile, async () => {
    const links = new Map<number, RegistryLink>();

    const manual = new Map(await loadManualFromFile());
    for (const [accountId, login] of loadManualFromEnv()) manual.set(accountId, login);
    for (const [accountId, login] of manual) {
      links.set(accountId, { login, source: "manual", displayName: null });
    }

    // Verified links win: ownership of both sides was proved.
    for (const link of await getLinkStore().all()) {
      const login = normaliseTwitchLogin(link.twitchLogin);
      if (!login) continue;
      links.set(link.accountId, {
        login,
        source: "verified",
        displayName: link.twitchDisplayName || null,
      });
    }

    return links;
  });
}
