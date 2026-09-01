/**
 * Twitch app access token (client credentials grant).
 *
 * Public VOD and stream data needs no user login, so a single app token serves
 * every request. Tokens last ~60 days; we refresh on expiry and on the first
 * 401 in case the token was revoked early.
 */

import { env } from "@/lib/env";
import { HttpError, buildUrl, requestJson } from "@/lib/http";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TokenState {
  token: string | null;
  expiresAt: number;
  inflight: Promise<string> | null;
}

const globalRef = globalThis as typeof globalThis & { __streamlockTwitchToken?: TokenState };

const state: TokenState = (globalRef.__streamlockTwitchToken ??= {
  token: null,
  expiresAt: 0,
  inflight: null,
});

export function isTwitchConfigured(): boolean {
  return Boolean(env.twitch.clientId && env.twitch.clientSecret);
}

export function invalidateTwitchToken(): void {
  state.token = null;
  state.expiresAt = 0;
}

export async function getAppAccessToken(): Promise<string> {
  if (!isTwitchConfigured()) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET must be configured");
  }
  if (state.token && state.expiresAt > Date.now() + 60_000) return state.token;
  if (state.inflight) return state.inflight;

  const request = (async () => {
    const target = buildUrl("https://id.twitch.tv", "/oauth2/token", {
      client_id: env.twitch.clientId,
      client_secret: env.twitch.clientSecret,
      grant_type: "client_credentials",
    });
    const response = await requestJson<TokenResponse>(target, {
      label: "twitch-oauth",
      method: "POST",
      timeoutMs: 10_000,
      noRetryStatuses: [400, 401, 403],
    });
    state.token = response.access_token;
    // Trim 5 minutes off the lifetime so in-flight requests never race expiry.
    state.expiresAt = Date.now() + Math.max(0, response.expires_in - 300) * 1000;
    return response.access_token;
  })().finally(() => {
    state.inflight = null;
  });

  state.inflight = request;
  return request;
}

export async function twitchHeaders(): Promise<Record<string, string>> {
  const token = await getAppAccessToken();
  return {
    authorization: `Bearer ${token}`,
    "client-id": env.twitch.clientId as string,
  };
}

/** Runs a Helix request, refreshing the token once if Twitch rejects it. */
export async function withTwitchAuth<T>(run: (headers: Record<string, string>) => Promise<T>): Promise<T> {
  try {
    return await run(await twitchHeaders());
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) {
      invalidateTwitchToken();
      return run(await twitchHeaders());
    }
    throw error;
  }
}
