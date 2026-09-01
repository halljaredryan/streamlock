/**
 * Steam identity conversions.
 *
 * Deadlock (and every API around it) keys players by the 32-bit "account id",
 * while users copy 64-bit SteamID64s or profile URLs. Everything funnels
 * through `parseSteamInput` so the rest of the app only handles account ids.
 */

const STEAM64_BASE = 76561197960265728n;
const MAX_ACCOUNT_ID = 0xffff_ffff;

export function accountIdToSteamId64(accountId: number): string {
  return (STEAM64_BASE + BigInt(accountId)).toString();
}

export function steamId64ToAccountId(steamId64: string): number {
  const value = BigInt(steamId64) - STEAM64_BASE;
  if (value < 0n || value > BigInt(MAX_ACCOUNT_ID)) {
    throw new Error(`SteamID64 ${steamId64} is out of range`);
  }
  return Number(value);
}

export function steamProfileUrl(accountId: number): string {
  return `https://steamcommunity.com/profiles/${accountIdToSteamId64(accountId)}`;
}

/**
 * Extracts the SteamID64 from an OpenID 2.0 `claimed_id`, or null if the value
 * is not a Steam identity URL. Deliberately strict: the callback query string is
 * attacker-controlled, so this must not accept lookalike hosts or paths.
 */
const OPENID_CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function parseSteamClaimedId(claimedId: string): string | null {
  return OPENID_CLAIMED_ID.exec(claimedId.trim())?.[1] ?? null;
}

export type SteamInput =
  | { kind: "accountId"; accountId: number }
  /**
   * A vanity URL segment or a persona name that still needs a lookup.
   * `fromVanityUrl` distinguishes `steamcommunity.com/id/<vanity>` (resolvable
   * only via the Steam Web API) from free text a user typed.
   */
  | { kind: "search"; query: string; fromVanityUrl: boolean };

function isDigits(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Accepts: account id, SteamID64, STEAM_0:1:X, [U:1:X],
 * steamcommunity.com/profiles/<id>, steamcommunity.com/id/<vanity>,
 * statlocker.gg/profile/<id>, or a bare persona name.
 */
export function parseSteamInput(raw: string): SteamInput {
  const input = raw.trim();
  if (!input) throw new Error("Enter a Steam ID, profile URL, or player name");

  const steam2 = input.match(/^STEAM_[0-5]:([01]):(\d+)$/i);
  if (steam2) {
    const universe = Number(steam2[1]);
    const remainder = Number(steam2[2]);
    return { kind: "accountId", accountId: remainder * 2 + universe };
  }

  const steam3 = input.match(/^\[?U:1:(\d+)\]?$/i);
  if (steam3) {
    return { kind: "accountId", accountId: Number(steam3[1]) };
  }

  if (/^https?:\/\//i.test(input) || /^(www\.)?(steamcommunity|statlocker|deadlock-api)\./i.test(input)) {
    const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
    let parsed: URL;
    try {
      parsed = new URL(withProtocol);
    } catch {
      throw new Error(`Could not understand "${raw}"`);
    }
    const segments = parsed.pathname.split("/").filter(Boolean);

    const profilesIndex = segments.indexOf("profiles");
    if (profilesIndex >= 0) {
      const candidate = segments[profilesIndex + 1];
      if (candidate && isDigits(candidate)) return fromDigits(candidate);
    }

    const idIndex = segments.indexOf("id");
    if (idIndex >= 0) {
      const vanity = segments[idIndex + 1];
      if (vanity) {
        return { kind: "search", query: decodeURIComponent(vanity), fromVanityUrl: true };
      }
    }

    // statlocker.gg/profile/<accountId> and similar tracker URLs.
    const last = segments.at(-1);
    if (last && isDigits(last)) return fromDigits(last);
    if (last) return { kind: "search", query: decodeURIComponent(last), fromVanityUrl: false };

    throw new Error(`Could not find a Steam ID in "${raw}"`);
  }

  if (isDigits(input)) return fromDigits(input);

  return { kind: "search", query: input, fromVanityUrl: false };
}

function fromDigits(digits: string): SteamInput {
  // 17-digit values are SteamID64s; anything shorter is already an account id.
  if (digits.length >= 17) {
    return { kind: "accountId", accountId: steamId64ToAccountId(digits) };
  }
  const accountId = Number(digits);
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || accountId > MAX_ACCOUNT_ID) {
    throw new Error(`"${digits}" is not a valid Steam account id`);
  }
  return { kind: "accountId", accountId };
}
