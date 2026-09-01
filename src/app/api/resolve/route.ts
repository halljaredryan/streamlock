import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { resolveVanityUrl } from "@/lib/steam/client";
import { parseSteamInput } from "@/lib/steam/id";
import { buildDemoResult } from "@/lib/theater/fixtures";
import { findCandidates, resolveIdentity } from "@/lib/theater/pipeline";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(1, "Enter a Steam ID, profile URL, or player name").max(120),
});

/**
 * Turns whatever the user typed into either one account (ids, SteamID64s and
 * profile URLs are unambiguous) or a list of candidates to pick from (persona
 * names and vanity URLs are not).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ q: url.searchParams.get("q") ?? "" });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid search";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (env.demo) {
    const demo = buildDemoResult();
    return NextResponse.json({ kind: "exact", player: demo.viewer, mode: "demo" });
  }

  try {
    const input = parseSteamInput(parsed.data.q);

    if (input.kind === "accountId") {
      const player = await resolveIdentity(input.accountId);
      return NextResponse.json({ kind: "exact", player, mode: "live" });
    }

    // An explicit /id/<vanity> URL names one specific account, so the Steam Web
    // API is authoritative for it.
    if (input.fromVanityUrl) {
      const vanityAccountId = await resolveVanityUrl(input.query);
      if (vanityAccountId !== null) {
        const player = await resolveIdentity(vanityAccountId);
        return NextResponse.json({ kind: "exact", player, mode: "live" });
      }
    }

    // Bare text is a persona search, which Deadlock ranks by recent activity,
    // so the intended player is usually first. Vanity lookup must not pre-empt
    // this: common names are often somebody's unrelated Steam vanity URL, and
    // resolving one would silently collapse the ranked list to a single wrong
    // account that may not even play Deadlock.
    const candidates = await findCandidates(input.query);
    if (candidates.length > 1) {
      return NextResponse.json({ kind: "candidates", players: candidates, mode: "live" });
    }
    if (candidates.length === 1) {
      return NextResponse.json({ kind: "exact", player: candidates[0], mode: "live" });
    }

    // No Deadlock player by that name, so the text may still be a vanity id.
    if (!input.fromVanityUrl) {
      const vanityAccountId = await resolveVanityUrl(input.query);
      if (vanityAccountId !== null) {
        const player = await resolveIdentity(vanityAccountId);
        return NextResponse.json({ kind: "exact", player, mode: "live" });
      }
    }

    return NextResponse.json(
      {
        error: input.fromVanityUrl
          ? `Could not resolve the profile URL for "${input.query}".${
              process.env.STEAM_API_KEY ? "" : " Set STEAM_API_KEY to resolve vanity URLs."
            }`
          : `No Deadlock players found matching "${input.query}".`,
      },
      { status: 404 },
    );
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        { error: `Lookup failed upstream (${error.label} ${error.status || "network error"}).` },
        { status: 502 },
      );
    }
    const message = error instanceof Error ? error.message : "Could not resolve that input";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
