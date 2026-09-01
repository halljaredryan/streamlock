import { NextResponse, type NextRequest } from "next/server";

import {
  attachSession,
  createOAuthState,
  isLinkingConfigured,
  newSession,
  readSession,
} from "@/lib/auth/session";
import { buildTwitchAuthorizeUrl } from "@/lib/auth/twitch-oauth";
import { env, resolveOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

export function twitchRedirectUri(origin: string): string {
  // Twitch requires an exact match against a URI registered on the app, so an
  // explicit override wins over the inferred origin.
  return env.twitch.redirectUri ?? `${origin}/api/auth/twitch/callback`;
}

export async function GET(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const origin = resolveOrigin(request.url);
  const session = readSession(request) ?? newSession();
  const state = createOAuthState();

  const response = NextResponse.redirect(
    buildTwitchAuthorizeUrl({ redirectUri: twitchRedirectUri(origin), state: state.value }),
  );
  // The state lives in the signed session so the callback can prove this
  // redirect started here, blocking cross-site login CSRF.
  attachSession(response, { ...session, oauthState: state });
  return response;
}
