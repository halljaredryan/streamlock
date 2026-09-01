import { NextResponse, type NextRequest } from "next/server";

import { attachSession, isLinkingConfigured, newSession, readSession } from "@/lib/auth/session";
import { verifySteamOpenId } from "@/lib/auth/steam-openid";
import { resolveOrigin } from "@/lib/env";
import { resolveIdentity } from "@/lib/theater/pipeline";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const origin = resolveOrigin(request.url);
  const query = new URL(request.url).searchParams;

  const result = await verifySteamOpenId(query, `${origin}/api/auth/steam/callback`);
  if (!result.ok) {
    return NextResponse.redirect(
      `${origin}/link?error=${encodeURIComponent(result.reason)}`,
    );
  }

  // Best effort: a persona name makes the confirmation screen legible.
  let personaName: string | null = null;
  try {
    personaName = (await resolveIdentity(result.accountId)).personaName;
  } catch {
    personaName = null;
  }

  const session = readSession(request) ?? newSession();
  const response = NextResponse.redirect(`${origin}/link?steam=ok`);
  attachSession(response, {
    ...session,
    steam: { accountId: result.accountId, personaName },
  });
  return response;
}
