/**
 * Twitch OAuth authorization-code flow, used for identity only.
 *
 * All of Streamlock's actual data reads run on the shared app access token (see
 * README). The only thing this flow establishes is "the visitor controls this
 * channel", so it requests no scopes, reads the user once, and then revokes the
 * token immediately. Nothing is persisted except the public login/id.
 */

import { env } from "@/lib/env";
import { HttpError, buildUrl, requestJson } from "@/lib/http";
import type { TwitchIdentity } from "@/lib/auth/session";

const ID_BASE = "https://id.twitch.tv";
const HELIX_USERS = "https://api.twitch.tv/helix/users";

export function buildTwitchAuthorizeUrl(args: { redirectUri: string; state: string }): string {
  if (!env.twitch.clientId) throw new Error("TWITCH_CLIENT_ID is not configured");

  return buildUrl(ID_BASE, "/oauth2/authorize", {
    client_id: env.twitch.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    // Deliberately empty: proving account ownership needs no scope, and asking
    // for none keeps the consent screen honest.
    scope: "",
    state: args.state,
    force_verify: "true",
  });
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface UsersResponse {
  data?: Array<{ id: string; login: string; display_name: string }>;
}

export type TwitchIdentityResult =
  | { ok: true; identity: TwitchIdentity }
  | { ok: false; reason: string };

export async function exchangeCodeForIdentity(
  code: string,
  redirectUri: string,
): Promise<TwitchIdentityResult> {
  if (!env.twitch.clientId || !env.twitch.clientSecret) {
    return { ok: false, reason: "Twitch credentials are not configured." };
  }

  let token: string;
  try {
    const body = new URLSearchParams({
      client_id: env.twitch.clientId,
      client_secret: env.twitch.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });

    const response = await requestJson<TokenResponse>(`${ID_BASE}/oauth2/token`, {
      label: "twitch-oauth",
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      timeoutMs: 10_000,
      // An invalid or reused code is a permanent failure; retrying wastes the code.
      noRetryStatuses: [400, 401, 403],
    });
    token = response.access_token;
  } catch (error) {
    if (error instanceof HttpError && error.status === 400) {
      return { ok: false, reason: "That Twitch sign-in link has already been used or expired." };
    }
    return { ok: false, reason: "Could not complete the Twitch sign-in." };
  }

  try {
    // With no id/login parameter, Get Users returns the token's own user.
    const users = await requestJson<UsersResponse>(HELIX_USERS, {
      label: "twitch",
      headers: {
        authorization: `Bearer ${token}`,
        "client-id": env.twitch.clientId,
      },
      timeoutMs: 10_000,
    });

    const user = users.data?.[0];
    if (!user) return { ok: false, reason: "Twitch did not return an account." };

    return {
      ok: true,
      identity: {
        userId: user.id,
        login: user.login.toLowerCase(),
        displayName: user.display_name || user.login,
      },
    };
  } catch {
    return { ok: false, reason: "Could not read your Twitch account." };
  } finally {
    // The token has served its purpose; do not keep a credential we never use.
    void revokeToken(token);
  }
}

async function revokeToken(token: string): Promise<void> {
  if (!env.twitch.clientId) return;
  try {
    await fetch(`${ID_BASE}/oauth2/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.twitch.clientId, token }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Best effort: the token expires on its own and is never stored.
  }
}
