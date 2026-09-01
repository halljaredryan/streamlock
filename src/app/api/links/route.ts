import { NextResponse, type NextRequest } from "next/server";

import { isLinkingConfigured, readSession } from "@/lib/auth/session";
import { getLinkStore } from "@/lib/links/store";
import type { VerifiedLink } from "@/lib/links/store";

export const dynamic = "force-dynamic";

/**
 * Commits the link. Both identities must be present in the signed session,
 * which means both were verified server-side: Steam via an OpenID assertion
 * Steam itself confirmed, Twitch via an authorization code exchanged for a
 * token on that account. The client never supplies either identifier.
 */
export async function POST(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const session = readSession(request);
  if (!session?.steam) {
    return NextResponse.json({ error: "Sign in with Steam first." }, { status: 401 });
  }
  if (!session.twitch) {
    return NextResponse.json({ error: "Connect your Twitch account first." }, { status: 401 });
  }

  const link: VerifiedLink = {
    accountId: session.steam.accountId,
    twitchUserId: session.twitch.userId,
    twitchLogin: session.twitch.login,
    twitchDisplayName: session.twitch.displayName,
    linkedAt: new Date().toISOString(),
  };

  await getLinkStore().put(link);
  return NextResponse.json({ ok: true, link });
}

/** Removes the link for the Steam account proved in this session. */
export async function DELETE(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const session = readSession(request);
  if (!session?.steam) {
    return NextResponse.json({ error: "Sign in with Steam first." }, { status: 401 });
  }

  const removed = await getLinkStore().remove(session.steam.accountId);
  return NextResponse.json({ ok: true, removed });
}
