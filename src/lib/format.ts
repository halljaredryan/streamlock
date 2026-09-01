/** Presentation helpers shared by client components. */

export function formatRelativeTime(unixSeconds: number, now = Date.now()): string {
  const deltaSeconds = Math.floor(now / 1000) - unixSeconds;
  if (deltaSeconds < 60) return "just now";

  const units: Array<[label: string, seconds: number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];

  for (const [label, seconds] of units) {
    const value = Math.floor(deltaSeconds / seconds);
    if (value >= 1) return `${value} ${label}${value === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

/** "36m 14s" — for match lengths. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

/** "1:02:03" — for a VOD timestamp. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}

export function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: "compact" }).format(value);
}

export function formatKda(
  kills: number | null,
  deaths: number | null,
  assists: number | null,
): string | null {
  if (kills === null && deaths === null && assists === null) return null;
  return `${kills ?? 0} / ${deaths ?? 0} / ${assists ?? 0}`;
}
