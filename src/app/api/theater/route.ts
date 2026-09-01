import { NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { buildDemoResult } from "@/lib/theater/fixtures";
import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT, PipelineError, runTheater } from "@/lib/theater/pipeline";

export const dynamic = "force-dynamic";
// The pipeline fans out to three providers; give it room on cold caches.
export const maxDuration = 60;

const querySchema = z.object({
  accountId: z.coerce.number().int().positive().max(0xffff_ffff),
  matches: z.coerce.number().int().min(1).max(MAX_MATCH_LIMIT).default(DEFAULT_MATCH_LIMIT),
  stored: z
    .enum(["0", "1", "true", "false"])
    .default("false")
    .transform((value) => value === "1" || value === "true"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);

  if (env.demo) {
    return NextResponse.json(buildDemoResult());
  }

  const parsed = querySchema.safeParse({
    accountId: url.searchParams.get("accountId"),
    matches: url.searchParams.get("matches") ?? undefined,
    stored: url.searchParams.get("stored") ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: `Invalid request: ${message}` }, { status: 400 });
  }

  try {
    const result = await runTheater({
      accountId: parsed.data.accountId,
      matchLimit: parsed.data.matches,
      onlyStoredHistory: parsed.data.stored,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PipelineError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof HttpError) {
      return NextResponse.json(
        {
          error: `${error.label} request failed (${error.status || "network error"}).`,
        },
        { status: error.isRateLimited ? 429 : 502 },
      );
    }
    console.error("[theater] unexpected failure", error);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
