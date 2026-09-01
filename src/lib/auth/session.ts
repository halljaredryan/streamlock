/**
 * Signed-cookie session.
 *
 * Linking needs to hold two half-finished identities (Steam and Twitch) across
 * a pair of redirects, and it needs to survive without a database. So the
 * session is the cookie: a JSON payload plus an HMAC, which the server verifies
 * on every read. Nothing secret is stored in it — only public identifiers — but
 * it must be tamper-proof, because a forged `steam.accountId` would let someone
 * write a link for an account they do not own.
 *
 * Read with `readSession(request)`, write with `attachSession(response, data)`.
 * Route handlers get a NextRequest/NextResponse pair, which keeps cookie
 * handling explicit instead of relying on ambient async storage.
 */

import { randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";

import { constantTimeEqual, decodeSigned, encodeSigned } from "@/lib/auth/session-codec";
import { env } from "@/lib/env";

export const SESSION_COOKIE = "streamlock_session";
const MAX_AGE_SECONDS = 60 * 60 * 12;
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

export interface SteamIdentity {
  accountId: number;
  personaName: string | null;
}

export interface TwitchIdentity {
  userId: string;
  login: string;
  displayName: string;
}

export interface SessionData {
  steam?: SteamIdentity;
  twitch?: TwitchIdentity;
  /** CSRF token for an in-flight OAuth redirect. */
  oauthState?: { value: string; expiresAt: number };
  issuedAt: number;
}

export function isLinkingConfigured(): boolean {
  return Boolean(env.sessionSecret && env.twitch.clientId && env.twitch.clientSecret);
}

function secret(): string {
  if (!env.sessionSecret) {
    throw new Error("STREAMLOCK_SESSION_SECRET is not configured");
  }
  return env.sessionSecret;
}

export function encodeSession(data: SessionData): string {
  return encodeSigned(secret(), data);
}

export function decodeSession(raw: string | undefined): SessionData | null {
  const result = decodeSigned<SessionData>(secret(), raw, MAX_AGE_SECONDS * 1000);
  return result.ok ? result.data : null;
}

export function readSession(request: NextRequest): SessionData | null {
  if (!env.sessionSecret) return null;
  return decodeSession(request.cookies.get(SESSION_COOKIE)?.value);
}

export function attachSession(response: NextResponse, data: SessionData): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: encodeSession({ ...data, issuedAt: data.issuedAt || Date.now() }),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function newSession(): SessionData {
  return { issuedAt: Date.now() };
}

export function createOAuthState(): { value: string; expiresAt: number } {
  return {
    value: randomBytes(24).toString("base64url"),
    expiresAt: Date.now() + OAUTH_STATE_TTL_SECONDS * 1000,
  };
}

export function isOAuthStateValid(
  session: SessionData | null,
  provided: string | null | undefined,
): boolean {
  const state = session?.oauthState;
  if (!state || !provided) return false;
  if (state.expiresAt < Date.now()) return false;
  return constantTimeEqual(state.value, provided);
}
