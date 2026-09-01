/**
 * Statlocker API client (https://statlocker.gg/api).
 *
 * This is the provider that makes Streamlock possible: a Statlocker profile
 * carries the player's own `twitchUsername`, so we discover linked channels
 * from opt-in profile data instead of guessing from persona names.
 *
 * Quotas (per key, hourly sliding window): 1,000 match requests,
 * 10,000 account requests. Batch endpoints bill per item, so every call here
 * is batched and cached.
 */

import { chunk, mapLimit } from "@/lib/async";
import { TTL, cached } from "@/lib/cache";
import { env } from "@/lib/env";
import { HttpError, buildUrl, requestJson } from "@/lib/http";

const LABEL = "statlocker";
const MATCH_BATCH_SIZE = 10;
const PROFILE_BATCH_SIZE = 100;

export interface StatlockerSteamProfile {
  accountId: number;
  name: string | null;
  avatarUrl: string | null;
  ppScore?: number | null;
  estimatedRankNumber?: number | null;
  region?: string | null;
}

export interface StatlockerMatchPlayer {
  match_id: number;
  account_id: number;
  /** "Amber Hand" or "Sapphire Flame". */
  team: string;
  hero_id: number;
  kills: number;
  deaths: number;
  assists: number;
  player_damage?: number | null;
  total_souls?: number | null;
  playerWon?: boolean | null;
  partySize?: number | null;
  mvpScore?: number | null;
  teamMvpPlacement?: number | null;
  globalRank?: number | null;
  steamProfile?: StatlockerSteamProfile | null;
}

export interface StatlockerMatch {
  matchId: number;
  /** ISO 8601 with offset, e.g. "2025-09-08T15:45:41.000+00:00". */
  matchDate: string;
  matchDurationSeconds: number;
  amberHandWon?: boolean | null;
  matchWasAbandoned?: boolean | null;
  gameMode?: number | null;
  amberHandMeanPPScore?: number | null;
  sapphireFlameMeanPPScore?: number | null;
  players: StatlockerMatchPlayer[];
}

export interface StatlockerProfile {
  accountId: number;
  name: string | null;
  avatarUrl: string | null;
  /** The linked Twitch channel login, or null when the player has none. */
  twitchUsername: string | null;
  youtubeChannelUrl?: string | null;
  region?: string | null;
  ppScore?: number | null;
  estimatedRankNumber?: number | null;
  lastUpdated?: string | null;
}

export function isStatlockerConfigured(): boolean {
  return Boolean(env.statlocker.apiKey);
}

function requireKey(): string {
  const key = env.statlocker.apiKey;
  if (!key) throw new Error("STATLOCKER_API_KEY is not configured");
  return key;
}

function headers(): Record<string, string> {
  return { "X-API-Key": requireKey(), "content-type": "application/json" };
}

/** Fetches match rosters in batches of 10 (the documented maximum). */
export async function getMatches(matchIds: readonly number[]): Promise<Map<number, StatlockerMatch>> {
  const result = new Map<number, StatlockerMatch>();
  if (matchIds.length === 0 || !isStatlockerConfigured()) return result;

  const batches = chunk([...new Set(matchIds)].sort((a, b) => a - b), MATCH_BATCH_SIZE);
  const responses = await mapLimit(batches, 3, (batch) => fetchMatchBatch(batch));

  for (const match of responses.flat()) {
    if (match && typeof match.matchId === "number") result.set(match.matchId, match);
  }
  return result;
}

async function fetchMatchBatch(matchIds: number[]): Promise<StatlockerMatch[]> {
  const key = `statlocker:matches:${matchIds.join(",")}`;
  return cached(key, TTL.matchDetail, async () => {
    const target = buildUrl(env.statlocker.baseUrl, "/api/public/matches");
    try {
      const response = await requestJson<StatlockerMatch[]>(target, {
        label: LABEL,
        method: "POST",
        headers: headers(),
        body: JSON.stringify(matchIds),
        timeoutMs: 20_000,
      });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      if (error instanceof HttpError && error.isNotFound) return [];
      throw error;
    }
  });
}

/**
 * Fetches profiles in batches of 100. This is the step that reveals which
 * players have a Twitch channel attached.
 */
export async function getProfiles(
  accountIds: readonly number[],
): Promise<Map<number, StatlockerProfile>> {
  const result = new Map<number, StatlockerProfile>();
  if (accountIds.length === 0 || !isStatlockerConfigured()) return result;

  const batches = chunk([...new Set(accountIds)].sort((a, b) => a - b), PROFILE_BATCH_SIZE);
  const responses = await mapLimit(batches, 3, (batch) => fetchProfileBatch(batch));

  for (const profile of responses.flat()) {
    if (profile && typeof profile.accountId === "number") result.set(profile.accountId, profile);
  }
  return result;
}

async function fetchProfileBatch(accountIds: number[]): Promise<StatlockerProfile[]> {
  const key = `statlocker:profiles:${accountIds.join(",")}`;
  return cached(key, TTL.profile, async () => {
    const target = buildUrl(env.statlocker.baseUrl, "/api/public/profiles");
    try {
      const response = await requestJson<StatlockerProfile[]>(target, {
        label: LABEL,
        method: "POST",
        headers: headers(),
        body: JSON.stringify(accountIds),
        timeoutMs: 20_000,
      });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      if (error instanceof HttpError && error.isNotFound) return [];
      throw error;
    }
  });
}

export async function getProfile(accountId: number): Promise<StatlockerProfile | null> {
  if (!isStatlockerConfigured()) return null;
  const key = `statlocker:profile:${accountId}`;
  return cached(key, TTL.profile, async () => {
    const target = buildUrl(env.statlocker.baseUrl, `/api/public/profile/${accountId}`);
    try {
      return await requestJson<StatlockerProfile>(target, {
        label: LABEL,
        headers: { "X-API-Key": requireKey() },
        timeoutMs: 15_000,
      });
    } catch (error) {
      if (error instanceof HttpError && error.isNotFound) return null;
      throw error;
    }
  });
}

export { parseStatlockerDate } from "@/lib/time";
