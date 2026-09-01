/**
 * Pure signing/verification core for the session cookie.
 *
 * Kept free of imports so it can be tested directly: this is the code that
 * decides whether a `steam.accountId` claim is trustworthy, and a flaw here
 * would let anyone write a link for an account they do not own.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export interface SignedEnvelope {
  issuedAt: number;
}

export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, and length is not a secret here.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function encodeSigned<T extends SignedEnvelope>(secret: string, data: T): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${signature(secret, payload)}`;
}

export type DecodeFailure = "missing" | "malformed" | "bad-signature" | "expired";

export type DecodeResult<T> = { ok: true; data: T } | { ok: false; reason: DecodeFailure };

export function decodeSigned<T extends SignedEnvelope>(
  secret: string,
  raw: string | undefined | null,
  maxAgeMs: number,
  now = Date.now(),
): DecodeResult<T> {
  if (!raw) return { ok: false, reason: "missing" };

  // Split on the last separator so base64url payloads stay intact.
  const separator = raw.lastIndexOf(".");
  if (separator <= 0 || separator === raw.length - 1) {
    return { ok: false, reason: "malformed" };
  }

  const payload = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);
  if (!constantTimeEqual(provided, signature(secret, payload))) {
    return { ok: false, reason: "bad-signature" };
  }

  let parsed: T;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!parsed || typeof parsed.issuedAt !== "number") return { ok: false, reason: "malformed" };
  if (now - parsed.issuedAt > maxAgeMs) return { ok: false, reason: "expired" };

  return { ok: true, data: parsed };
}
