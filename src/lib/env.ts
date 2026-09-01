/**
 * Server-side configuration. Read once at module load so a missing key is a
 * predictable, reportable condition rather than a surprise mid-pipeline.
 */

function str(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function url(name: string, fallback: string): string {
  return (str(name) ?? fallback).replace(/\/+$/, "");
}

export const env = {
  statlocker: {
    apiKey: str("STATLOCKER_API_KEY"),
    baseUrl: url("STATLOCKER_BASE_URL", "https://statlocker.gg"),
  },
  deadlock: {
    apiKey: str("DEADLOCK_API_KEY"),
    baseUrl: url("DEADLOCK_API_BASE_URL", "https://api.deadlock-api.com"),
    assetsBaseUrl: url("DEADLOCK_ASSETS_BASE_URL", "https://assets.deadlock-api.com"),
  },
  twitch: {
    clientId: str("TWITCH_CLIENT_ID"),
    clientSecret: str("TWITCH_CLIENT_SECRET"),
    /** Must match a redirect URI registered on the Twitch app exactly. */
    redirectUri: str("TWITCH_REDIRECT_URI"),
  },
  steam: {
    apiKey: str("STEAM_API_KEY"),
  },
  /** Signs the linking session cookie. Without it, account linking is disabled. */
  sessionSecret: str("STREAMLOCK_SESSION_SECRET"),
  /**
   * Public origin, used to build OAuth redirect and OpenID return URLs. Falls
   * back to the request origin, which is correct in development but wrong behind
   * a proxy that terminates TLS.
   */
  publicUrl: str("STREAMLOCK_PUBLIC_URL"),
  demo: str("STREAMLOCK_DEMO") === "1",
} as const;

/**
 * Origin to use in redirect URLs. Prefers the configured public URL so that a
 * proxied deployment does not hand Twitch an internal address.
 */
export function resolveOrigin(requestUrl: string | URL): string {
  if (env.publicUrl) return env.publicUrl.replace(/\/+$/, "");
  return new URL(requestUrl).origin;
}

export type ProviderName = "deadlock" | "statlocker" | "twitch" | "steam";

export interface ProviderStatus {
  name: ProviderName;
  configured: boolean;
  /** A missing required provider blocks the pipeline entirely. */
  required: boolean;
  detail: string;
}

export function providerStatuses(): ProviderStatus[] {
  return [
    {
      name: "deadlock",
      configured: true,
      required: true,
      detail: env.deadlock.apiKey
        ? "Recent match list (patron key present)."
        : "Recent match list (public access, no key needed).",
    },
    {
      name: "statlocker",
      configured: Boolean(env.statlocker.apiKey),
      required: false,
      detail: env.statlocker.apiKey
        ? "Match rosters and linked Twitch usernames."
        : "Set STATLOCKER_API_KEY to read linked Twitch usernames. Falling back to Deadlock API rosters.",
    },
    {
      name: "twitch",
      configured: Boolean(env.twitch.clientId && env.twitch.clientSecret),
      required: true,
      detail: "Resolves channels and searches VOD timelines.",
    },
    {
      name: "steam",
      configured: Boolean(env.steam.apiKey),
      required: false,
      detail:
        "Optional. Resolves steamcommunity.com/id/<vanity> URLs, which persona-name search cannot find.",
    },
  ];
}

/** Self-service account linking needs a session secret plus the Twitch app. */
export function linkingStatus(): { enabled: boolean; detail: string } {
  if (!env.sessionSecret) {
    return {
      enabled: false,
      detail: "Set STREAMLOCK_SESSION_SECRET to enable Steam + Twitch account linking.",
    };
  }
  if (!env.twitch.clientId || !env.twitch.clientSecret) {
    return { enabled: false, detail: "Account linking needs the Twitch client id and secret." };
  }
  return { enabled: true, detail: "Players can link their own Steam and Twitch accounts." };
}

/** Providers that are required but not configured. */
export function missingRequiredProviders(): ProviderName[] {
  return providerStatuses()
    .filter((provider) => provider.required && !provider.configured)
    .map((provider) => provider.name);
}

/**
 * Hostnames permitted to embed the Twitch player. Twitch rejects embeds whose
 * `parent` does not match the page hostname, so the client merges this list
 * with its own `location.hostname`.
 */
export function twitchParents(): string[] {
  const raw = process.env.NEXT_PUBLIC_TWITCH_PARENTS ?? "localhost";
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/^https?:\/\//, "").split("/")[0] ?? "")
    .filter(Boolean);
}
