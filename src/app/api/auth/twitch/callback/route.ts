import { NextResponse, type NextRequest } from "next/server";

import {
  attachSession,
  isLinkingConfigured,
  isOAuthStateValid,
  newSession,
  readSession,
} from "@/lib/auth/session";
import { exchangeCodeForIdentity } from "@/lib/auth/twitch-oauth";
import { env, resolveOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const origin = resolveOrigin(request.url);
  const query = new URL(request.url).searchParams;
  const fail = (reason: string) =>
    NextResponse.redirect(`${origin}/link?error=${encodeURIComponent(reason)}`);

  const denied = query.get("error");
  if (denied) {
    return fail(query.get("error_description") ?? "Twitch sign-in was declined.");
  }

  const session = readSession(request);
  if (!isOAuthStateValid(session, query.get("state"))) {
    return fail("That Twitch sign-in expired or did not start here. Please try again.");
  }

  const code = query.get("code");
  if (!code) return fail("Twitch did not return an authorization code.");

  const redirectUri = env.twitch.redirectUri ?? `${origin}/api/auth/twitch/callback`;
  const result = await exchangeCodeForIdentity(code, redirectUri);
  if (!result.ok) return fail(result.reason);

  const response = NextResponse.redirect(`${origin}/link?twitch=ok`);
  attachSession(response, {
    ...(session ?? newSession()),
    twitch: result.identity,
    // Burn the state so the code cannot be replayed.
    oauthState: undefined,
  });
  return response;
}
