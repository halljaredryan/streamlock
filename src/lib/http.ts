/**
 * A single fetch wrapper for every upstream call, so timeouts, retries and
 * rate-limit handling are consistent across Statlocker, Deadlock API and Twitch.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly label: string;
  readonly url: string;
  readonly body: string;

  constructor(args: { status: number; label: string; url: string; body: string; message?: string }) {
    super(args.message ?? `${args.label} responded ${args.status}`);
    this.name = "HttpError";
    this.status = args.status;
    this.label = args.label;
    this.url = args.url;
    this.body = args.body;
  }

  /** True when the caller should treat this as "no data" rather than a failure. */
  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isAuthFailure(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  /** Human-readable provider name used in errors and logs. */
  label: string;
  timeoutMs?: number;
  retries?: number;
  /** Statuses that should never be retried even if normally retryable. */
  noRetryStatuses?: number[];
}

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number, response?: Response): number {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 10_000);
  }
  const base = Math.min(400 * 2 ** attempt, 4_000);
  return base + Math.random() * 250;
}

export async function requestJson<T>(target: string, options: RequestOptions): Promise<T> {
  const { label, timeoutMs = 12_000, retries = 2, noRetryStatuses = [], ...init } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target, {
        ...init,
        signal: controller.signal,
        headers: { accept: "application/json", ...(init.headers ?? {}) },
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new HttpError({
          status: response.status,
          label,
          url: target,
          body: body.slice(0, 500),
        });

        const retryable =
          RETRYABLE_STATUSES.has(response.status) && !noRetryStatuses.includes(response.status);
        if (retryable && attempt < retries) {
          lastError = error;
          await sleep(retryDelayMs(attempt, response));
          continue;
        }
        throw error;
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      lastError = error;
      if (attempt < retries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new HttpError({
        status: 0,
        label,
        url: target,
        body: "",
        message: `${label} request failed: ${reason}`,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} request failed`);
}

export function buildUrl(
  base: string,
  path: string,
  query: Record<string, string | number | boolean | undefined | null> = {},
): string {
  const target = new URL(path.startsWith("/") ? path : `/${path}`, `${base}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, String(value));
  }
  return target.toString();
}
