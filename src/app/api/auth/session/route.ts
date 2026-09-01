import { NextResponse, type NextRequest } from "next/server";

import { clearSessionCookie, isLinkingConfigured, readSession } from "@/lib/auth/session";
import { linkingStatus } from "@/lib/env";
import { getLinkStore } from "@/lib/links/store";
import { accountIdToSteamId64 } from "@/lib/steam/id";

export const dynamic = "force-dynamic";

/** Current linking state: which halves are verified, and the committed link. */
export async function GET(request: NextRequest) {
  const status = linkingStatus();
  const session = isLinkingConfigured() ? readSession(request) : null;

  const existingLink = session?.steam
    ? await getLinkStore().get(session.steam.accountId)
    : null;

  return NextResponse.json({
    linking: status,
    steam: session?.steam
      ? { ...session.steam, steamId64: accountIdToSteamId64(session.steam.accountId) }
      : null,
    twitch: session?.twitch ?? null,
    link: existingLink,
  });
}

/** Sign out of both halves without touching stored links. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
