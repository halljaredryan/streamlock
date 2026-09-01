import { NextResponse, type NextRequest } from "next/server";

import { isLinkingConfigured } from "@/lib/auth/session";
import { buildSteamLoginUrl } from "@/lib/auth/steam-openid";
import { resolveOrigin } from "@/lib/env";

export const dynamic = "force-dynamic";

export function steamReturnTo(origin: string): string {
  return `${origin}/api/auth/steam/callback`;
}

export async function GET(request: NextRequest) {
  if (!isLinkingConfigured()) {
    return NextResponse.json({ error: "Account linking is not configured." }, { status: 501 });
  }

  const origin = resolveOrigin(request.url);
  return NextResponse.redirect(
    buildSteamLoginUrl({ returnTo: steamReturnTo(origin), realm: origin }),
  );
}
