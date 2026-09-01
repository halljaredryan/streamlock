/**
 * Steam OpenID 2.0 sign-in.
 *
 * Statlocker gives us self-reported Twitch usernames; this gives us *proof* that
 * the visitor owns a particular Steam account, which is the other half of a
 * trustworthy link. Steam never adopted OpenID Connect, so this is the old
 * OpenID 2.0 dance — and it needs no API key.
 *
 * The verification step is not optional: the callback query string is entirely
 * attacker-controlled, so the only thing that makes the claimed id trustworthy
 * is Steam confirming its own signature via `check_authentication`.
 */

import { parseSteamClaimedId, steamId64ToAccountId } from "@/lib/steam/id";

const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const OPENID_NS = "http://specs.openid.net/auth/2.0";
const IDENTIFIER_SELECT = "http://specs.openid.net/auth/2.0/identifier_select";

export function buildSteamLoginUrl(args: { returnTo: string; realm: string }): string {
  const params = new URLSearchParams({
    "openid.ns": OPENID_NS,
    "openid.mode": "checkid_setup",
    "openid.return_to": args.returnTo,
    "openid.realm": args.realm,
    "openid.identity": IDENTIFIER_SELECT,
    "openid.claimed_id": IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export type SteamVerifyResult =
  | { ok: true; accountId: number; steamId64: string }
  | { ok: false; reason: string };

/**
 * Verifies an OpenID `id_res` callback and returns the Deadlock account id.
 *
 * `expectedReturnTo` must be the exact URL passed to `buildSteamLoginUrl`. It is
 * covered by Steam's signature, so checking it prevents an assertion issued for
 * another site being replayed here.
 */
export async function verifySteamOpenId(
  query: URLSearchParams,
  expectedReturnTo: string,
): Promise<SteamVerifyResult> {
  const mode = query.get("openid.mode");
  if (mode === "cancel") return { ok: false, reason: "Steam sign-in was cancelled." };
  if (mode !== "id_res") return { ok: false, reason: "Unexpected response from Steam." };

  const returnTo = query.get("openid.return_to");
  if (returnTo !== expectedReturnTo) {
    return { ok: false, reason: "Steam response was issued for a different address." };
  }

  const steamId64 = parseSteamClaimedId(query.get("openid.claimed_id") ?? "");
  if (!steamId64) return { ok: false, reason: "Steam did not return a valid profile id." };

  // Ask Steam to confirm it signed this assertion. Forward every openid.*
  // parameter untouched apart from the mode, since the signature covers them.
  const body = new URLSearchParams();
  for (const [key, value] of query.entries()) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");

  let text: string;
  try {
    const response = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      return { ok: false, reason: `Steam verification failed (${response.status}).` };
    }
    text = await response.text();
  } catch {
    return { ok: false, reason: "Could not reach Steam to verify sign-in." };
  }

  // Response is a plain key:value document.
  const isValid = /(^|\n)is_valid\s*:\s*true\s*(\r?\n|$)/.test(text);
  if (!isValid) return { ok: false, reason: "Steam rejected the sign-in assertion." };

  try {
    return { ok: true, accountId: steamId64ToAccountId(steamId64), steamId64 };
  } catch {
    return { ok: false, reason: "Steam returned an out-of-range profile id." };
  }
}
