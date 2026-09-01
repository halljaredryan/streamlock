/**
 * Steam Web API, used for one thing only: turning a vanity URL segment
 * (steamcommunity.com/id/<vanity>) into a SteamID64.
 *
 * A vanity segment is not the persona name, so it cannot be found by searching
 * player names — this is the only way to resolve it. Optional: without a key,
 * callers fall back to Deadlock API's persona search.
 */

import { TTL, cached } from "@/lib/cache";
import { env } from "@/lib/env";
import { HttpError, buildUrl, requestJson } from "@/lib/http";
import { steamId64ToAccountId } from "@/lib/steam/id";

interface ResolveVanityResponse {
  response?: {
    /** 1 = resolved, 42 = no match. */
    success?: number;
    steamid?: string;
    message?: string;
  };
}

export function isSteamConfigured(): boolean {
  return Boolean(env.steam.apiKey);
}

/** Returns the Deadlock account id for a vanity segment, or null if unknown. */
export async function resolveVanityUrl(vanity: string): Promise<number | null> {
  if (!env.steam.apiKey) return null;

  const normalised = vanity.trim().toLowerCase();
  if (!normalised) return null;

  return cached(`steam:vanity:${normalised}`, TTL.steamProfile, async () => {
    const target = buildUrl("https://api.steampowered.com", "/ISteamUser/ResolveVanityURL/v1/", {
      key: env.steam.apiKey,
      vanityurl: normalised,
    });

    try {
      const response = await requestJson<ResolveVanityResponse>(target, {
        label: "steam",
        timeoutMs: 10_000,
      });
      if (response.response?.success !== 1 || !response.response.steamid) return null;
      return steamId64ToAccountId(response.response.steamid);
    } catch (error) {
      // A bad key or a rate limit should not break the search flow; the caller
      // falls back to persona search.
      if (error instanceof HttpError) return null;
      throw error;
    }
  });
}
