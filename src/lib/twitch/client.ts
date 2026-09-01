/**
 * Twitch Helix client, limited to the read-only endpoints Streamlock needs.
 *
 * Helix budgets 800 points/minute for an app token, and every call here is
 * batched (100 ids per request) and cached, so a typical page load costs a
 * handful of points.
 */

import { chunk, mapLimit } from "@/lib/async";
import { TTL, cached } from "@/lib/cache";
import { HttpError, buildUrl, requestJson } from "@/lib/http";
import { isTwitchConfigured, withTwitchAuth } from "@/lib/twitch/auth";
import { parseTwitchDuration } from "@/lib/twitch/vod";

const HELIX = "https://api.twitch.tv";
const LABEL = "twitch";
const ID_BATCH_SIZE = 100;

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string | null;
  offline_image_url?: string | null;
  description?: string | null;
  broadcaster_type?: string | null;
}

export interface TwitchVideo {
  id: string;
  stream_id: string | null;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  /** RFC3339 UTC. For archives this is when the stream started. */
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string | null;
  view_count: number;
  language: string;
  type: "archive" | "highlight" | "upload";
  /** Twitch duration string, e.g. "3h8m33s". */
  duration: string;
}

export interface TwitchStream {
  id: string;
  user_id: string;
  user_login: string;
  user_name: string;
  game_id: string;
  game_name: string;
  title: string;
  viewer_count: number;
  /** RFC3339 UTC. */
  started_at: string;
  thumbnail_url: string | null;
}

interface HelixList<T> {
  data: T[];
  pagination?: { cursor?: string };
}

/** A VOD with its timeline resolved to absolute unix seconds. */
export interface TwitchBroadcast {
  video: TwitchVideo;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

function toUnixSeconds(rfc3339: string): number {
  const millis = Date.parse(rfc3339);
  return Number.isNaN(millis) ? 0 : Math.floor(millis / 1000);
}

async function helixGet<T>(path: string, params: URLSearchParams): Promise<HelixList<T>> {
  const target = `${buildUrl(HELIX, path)}?${params.toString()}`;
  return withTwitchAuth((headers) =>
    requestJson<HelixList<T>>(target, { label: LABEL, headers, timeoutMs: 15_000 }),
  );
}

/** Resolves channel logins to Twitch user objects, dropping unknown logins. */
export async function getUsersByLogin(logins: readonly string[]): Promise<Map<string, TwitchUser>> {
  const result = new Map<string, TwitchUser>();
  if (logins.length === 0 || !isTwitchConfigured()) return result;

  const unique = [...new Set(logins.map((login) => login.toLowerCase()))].sort();
  const batches = chunk(unique, ID_BATCH_SIZE);

  const responses = await mapLimit(batches, 2, (batch) => {
    const key = `twitch:users:${batch.join(",")}`;
    return cached(key, TTL.twitchUser, async () => {
      const params = new URLSearchParams();
      for (const login of batch) params.append("login", login);
      try {
        const response = await helixGet<TwitchUser>("/helix/users", params);
        return response.data ?? [];
      } catch (error) {
        // Helix 400s the whole batch on a single malformed login; the callers
        // already normalise, so treat this as "none of these resolved".
        if (error instanceof HttpError && error.status === 400) return [];
        throw error;
      }
    });
  });

  for (const user of responses.flat()) {
    if (user?.login) result.set(user.login.toLowerCase(), user);
  }
  return result;
}

/**
 * Past broadcasts for a channel, newest first, paging back only as far as
 * `sinceSeconds`. Twitch retains VODs for 7-60 days depending on the channel,
 * so older matches legitimately return nothing.
 */
export async function getArchivesSince(
  userId: string,
  sinceSeconds: number,
  maxPages = 3,
): Promise<TwitchBroadcast[]> {
  if (!isTwitchConfigured()) return [];

  const key = `twitch:archives:${userId}:${Math.floor(sinceSeconds / 3_600)}`;
  return cached(key, TTL.twitchVideos, async () => {
    const broadcasts: TwitchBroadcast[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        user_id: userId,
        type: "archive",
        sort: "time",
        first: "100",
      });
      if (cursor) params.set("after", cursor);

      let response: HelixList<TwitchVideo>;
      try {
        response = await helixGet<TwitchVideo>("/helix/videos", params);
      } catch (error) {
        if (error instanceof HttpError && (error.isNotFound || error.status === 400)) break;
        throw error;
      }

      const videos = response.data ?? [];
      if (videos.length === 0) break;

      let reachedCutoff = false;
      for (const video of videos) {
        const startSeconds = toUnixSeconds(video.created_at);
        const durationSeconds = parseTwitchDuration(video.duration);
        const endSeconds = startSeconds + durationSeconds;
        if (endSeconds < sinceSeconds) {
          // Sorted newest first, so everything beyond here is older still.
          reachedCutoff = true;
          break;
        }
        broadcasts.push({ video, startSeconds, endSeconds, durationSeconds });
      }

      cursor = response.pagination?.cursor;
      if (reachedCutoff || !cursor) break;
    }

    return broadcasts;
  });
}

/** Currently-live channels, used to badge streamers and catch in-progress matches. */
export async function getStreamsByLogin(
  logins: readonly string[],
): Promise<Map<string, TwitchStream>> {
  const result = new Map<string, TwitchStream>();
  if (logins.length === 0 || !isTwitchConfigured()) return result;

  const unique = [...new Set(logins.map((login) => login.toLowerCase()))].sort();
  const batches = chunk(unique, ID_BATCH_SIZE);

  const responses = await mapLimit(batches, 2, (batch) => {
    const key = `twitch:streams:${batch.join(",")}`;
    return cached(key, TTL.twitchStreams, async () => {
      const params = new URLSearchParams({ first: "100" });
      for (const login of batch) params.append("user_login", login);
      try {
        const response = await helixGet<TwitchStream>("/helix/streams", params);
        return response.data ?? [];
      } catch (error) {
        if (error instanceof HttpError && error.status === 400) return [];
        throw error;
      }
    });
  });

  for (const stream of responses.flat()) {
    if (stream?.user_login) result.set(stream.user_login.toLowerCase(), stream);
  }
  return result;
}
