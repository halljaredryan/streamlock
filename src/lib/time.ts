/**
 * Deadlock API's bulk metadata endpoint returns `start_time` as
 * "YYYY-MM-DD HH:MM:SS" with no timezone marker, even though the value is UTC.
 * `Date.parse` treats that form as *local* time, which would shift every match
 * window by the host's UTC offset and misalign every VOD lookup.
 *
 * Both parsers live here, away from the HTTP clients that use them, so they can
 * be tested in isolation.
 */
export function parseDeadlockTimestamp(value: string): number {
  const normalised = value.trim().replace(" ", "T");
  const withZone = /(Z|[+-]\d{2}:?\d{2})$/.test(normalised) ? normalised : `${normalised}Z`;
  const millis = Date.parse(withZone);
  if (Number.isNaN(millis)) throw new Error(`Unparseable Deadlock timestamp: ${value}`);
  return Math.floor(millis / 1000);
}

/** Statlocker's `matchDate` is ISO 8601 and always carries an explicit offset. */
export function parseStatlockerDate(value: string): number {
  const millis = Date.parse(value.trim());
  if (Number.isNaN(millis)) throw new Error(`Unparseable Statlocker date: ${value}`);
  return Math.floor(millis / 1000);
}
