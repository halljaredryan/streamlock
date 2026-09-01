/**
 * The core matching logic: did a Twitch broadcast cover the window of a
 * Deadlock match, and if so, how far into the video does the match start?
 *
 * Twitch gives no way to query "who was live at time T", so we invert the
 * problem: for each candidate channel we pull its recent VODs (which carry a
 * start timestamp and a duration) and intersect those windows with the match
 * window. That interval arithmetic is all this module does.
 */

export interface TimeWindow {
  /** Unix seconds. */
  startSeconds: number;
  /** Unix seconds. */
  endSeconds: number;
}

export interface OverlapResult {
  overlapSeconds: number;
  /** Fraction of the match covered by the broadcast, 0-1. */
  coverage: number;
  /** Seconds from the start of the video to the start of the match. */
  offsetSeconds: number;
  /** "full" when the broadcast covers the entire match. */
  confidence: "full" | "partial";
}

/** Parses Twitch's ISO-8601-ish duration strings: "3h8m33s", "21m5s", "45s". */
export function parseTwitchDuration(duration: string): number {
  const match = duration.trim().match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3_600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/** Formats seconds as the `t=` parameter Twitch expects: "1h02m03s". */
export function formatTwitchOffset(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3_600);
  const minutes = Math.floor((clamped % 3_600) / 60);
  const seconds = clamped % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s`;
}

/**
 * Rewinds a few seconds before the match starts so the viewer sees the loading
 * screen and hero picks rather than dropping straight into the action.
 */
export const PRE_ROLL_SECONDS = 20;

export function computeOverlap(match: TimeWindow, broadcast: TimeWindow): OverlapResult | null {
  const overlapStart = Math.max(match.startSeconds, broadcast.startSeconds);
  const overlapEnd = Math.min(match.endSeconds, broadcast.endSeconds);
  const overlapSeconds = overlapEnd - overlapStart;
  if (overlapSeconds <= 0) return null;

  const matchDuration = Math.max(1, match.endSeconds - match.startSeconds);
  const coverage = Math.min(1, overlapSeconds / matchDuration);
  const rawOffset = match.startSeconds - broadcast.startSeconds;
  const offsetSeconds = Math.max(0, rawOffset - PRE_ROLL_SECONDS);

  return {
    overlapSeconds,
    coverage,
    offsetSeconds,
    confidence:
      broadcast.startSeconds <= match.startSeconds && broadcast.endSeconds >= match.endSeconds
        ? "full"
        : "partial",
  };
}

/**
 * Discards overlaps too small to be worth showing. A 30-second sliver usually
 * means the stream started as the match ended.
 */
export const MIN_OVERLAP_SECONDS = 60;

export function isMeaningfulOverlap(result: OverlapResult): boolean {
  return result.overlapSeconds >= MIN_OVERLAP_SECONDS;
}

export function vodWatchUrl(videoId: string, offsetSeconds: number): string {
  return `https://www.twitch.tv/videos/${videoId}?t=${formatTwitchOffset(offsetSeconds)}`;
}

export function channelUrl(login: string): string {
  return `https://www.twitch.tv/${login}`;
}

/** Twitch thumbnails are templated; both dimensions must be filled in. */
export function resolveThumbnail(
  template: string | null | undefined,
  width = 320,
  height = 180,
): string | null {
  if (!template) return null;
  return template
    .replace(/%?\{width\}/g, String(width))
    .replace(/%?\{height\}/g, String(height));
}

/**
 * Statlocker stores whatever the user typed, so a "twitchUsername" may arrive
 * as a full URL, an @handle, or with stray whitespace. Twitch logins are
 * lowercase alphanumerics plus underscore, 4-25 characters.
 */
export function normaliseTwitchLogin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim().toLowerCase();
  if (!value) return null;

  value = value.replace(/^https?:\/\//, "").replace(/^www\./, "");
  if (value.startsWith("twitch.tv/")) value = value.slice("twitch.tv/".length);
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/^@/, "");

  return /^[a-z0-9_]{3,25}$/.test(value) ? value : null;
}
