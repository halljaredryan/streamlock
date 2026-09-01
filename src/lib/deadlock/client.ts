/**
 * Deadlock API client (https://deadlock-api.com).
 *
 * Statlocker deliberately does not serve raw match history and points
 * developers here for it, so this client owns three jobs:
 *   1. the recent match list for an account (the entry point of the pipeline),
 *   2. Steam persona/avatar lookup without needing a Steam Web API key,
 *   3. a roster fallback for when no Statlocker key is configured.
 */

import { TTL, cached } from "@/lib/cache";
import { env } from "@/lib/env";
import { HttpError, buildUrl, requestJson } from "@/lib/http";

const LABEL = "deadlock-api";

function headers(): Record<string, string> {
  return env.deadlock.apiKey ? { "X-API-Key": env.deadlock.apiKey } : {};
}

export interface DeadlockMatchHistoryEntry {
  account_id: number;
  match_id: number;
  hero_id: number;
  /** Unix seconds. */
  start_time: number;
  match_duration_s: number;
  game_mode: number;
  match_mode: number;
  player_team: number;
  player_kills: number;
  player_deaths: number;
  player_assists: number;
  net_worth: number;
  last_hits: number;
  denies: number;
  /** 0 = team 0 won, 1 = team 1 won. */
  match_result: number;
  player_match_outcome?: number | null;
}

export interface DeadlockSteamProfile {
  account_id: number;
  personaname: string | null;
  profileurl: string | null;
  avatar: string | null;
  avatarmedium: string | null;
  avatarfull: string | null;
  matches_played_last_30d?: number | null;
}

export interface DeadlockBulkMatch {
  match_id: number;
  /** "YYYY-MM-DD HH:MM:SS" in UTC, without a zone marker. */
  start_time: string;
  duration_s: number;
  game_mode?: string | null;
  match_mode?: string | null;
  winning_team?: string | null;
  average_badge?: number | null;
  players?: DeadlockBulkPlayer[];
}

export interface DeadlockBulkPlayer {
  account_id: number;
  hero_id: number;
  /** "Team0" (Amber Hand) or "Team1" (Sapphire Flame). */
  team: string;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  net_worth?: number | null;
}

/**
 * Most recent matches first. `onlyStored` reads the community database only,
 * which skips Steam Game Coordinator calls and is not rate limited — the right
 * default for anything automated.
 */
export async function getMatchHistory(
  accountId: number,
  options: { limit?: number; onlyStored?: boolean } = {},
): Promise<DeadlockMatchHistoryEntry[]> {
  const { limit = 20, onlyStored = false } = options;
  const key = `deadlock:history:${accountId}:${onlyStored ? "stored" : "live"}`;

  const entries = await cached(key, TTL.matchHistory, async () => {
    const target = buildUrl(env.deadlock.baseUrl, `/v1/players/${accountId}/match-history`, {
      only_stored_history: onlyStored ? "true" : undefined,
    });
    try {
      const result = await requestJson<DeadlockMatchHistoryEntry[]>(target, {
        label: LABEL,
        headers: headers(),
        timeoutMs: 20_000,
      });
      return Array.isArray(result) ? result : [];
    } catch (error) {
      // A player with no tracked matches is a normal outcome, not an error.
      if (error instanceof HttpError && error.isNotFound) return [];
      throw error;
    }
  });

  return [...entries]
    .sort((a, b) => b.start_time - a.start_time || b.match_id - a.match_id)
    .slice(0, limit);
}

/** Roster fallback: one request covers up to ~100 matches. */
export async function getMatchesWithPlayers(matchIds: readonly number[]): Promise<DeadlockBulkMatch[]> {
  if (matchIds.length === 0) return [];
  const sorted = [...matchIds].sort((a, b) => a - b);
  const key = `deadlock:bulk:${sorted.join(",")}`;

  return cached(key, TTL.matchDetail, async () => {
    const target = buildUrl(env.deadlock.baseUrl, "/v1/matches/metadata", {
      match_ids: sorted.join(","),
      include_info: "true",
      include_player_info: "true",
      include_player_kda: "true",
      limit: sorted.length,
    });
    const result = await requestJson<DeadlockBulkMatch[]>(target, {
      label: LABEL,
      headers: headers(),
      timeoutMs: 25_000,
    });
    return Array.isArray(result) ? result : [];
  });
}

export async function getSteamProfiles(
  accountIds: readonly number[],
): Promise<Map<number, DeadlockSteamProfile>> {
  const result = new Map<number, DeadlockSteamProfile>();
  if (accountIds.length === 0) return result;

  const sorted = [...new Set(accountIds)].sort((a, b) => a - b);
  const key = `deadlock:steam:${sorted.join(",")}`;

  const profiles = await cached(key, TTL.steamProfile, async () => {
    const target = buildUrl(env.deadlock.baseUrl, "/v1/players/steam", {
      account_ids: sorted.join(","),
    });
    try {
      const response = await requestJson<DeadlockSteamProfile | DeadlockSteamProfile[]>(target, {
        label: LABEL,
        headers: headers(),
        timeoutMs: 20_000,
      });
      // The endpoint returns a bare object when a single id is requested.
      return Array.isArray(response) ? response : [response];
    } catch (error) {
      if (error instanceof HttpError && error.isNotFound) return [];
      throw error;
    }
  });

  for (const profile of profiles) {
    if (profile && typeof profile.account_id === "number") result.set(profile.account_id, profile);
  }
  return result;
}

/** Resolve a persona name or vanity segment to candidate accounts. */
export async function searchPlayers(query: string, limit = 10): Promise<DeadlockSteamProfile[]> {
  const key = `deadlock:search:${query.toLowerCase()}:${limit}`;
  return cached(key, TTL.steamProfile, async () => {
    const target = buildUrl(env.deadlock.baseUrl, "/v1/players/steam-search", {
      search_query: query,
      limit,
    });
    try {
      const result = await requestJson<DeadlockSteamProfile[]>(target, {
        label: LABEL,
        headers: headers(),
        timeoutMs: 20_000,
      });
      return Array.isArray(result) ? result : [];
    } catch (error) {
      if (error instanceof HttpError && error.isNotFound) return [];
      throw error;
    }
  });
}

export { parseDeadlockTimestamp } from "@/lib/time";
