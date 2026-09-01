import { NextResponse } from "next/server";

import { cacheStats } from "@/lib/cache";
import { env, linkingStatus, providerStatuses } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const providers = providerStatuses();
  const blocked = providers.filter((provider) => provider.required && !provider.configured);

  return NextResponse.json({
    ok: blocked.length === 0 || env.demo,
    mode: env.demo ? "demo" : "live",
    providers,
    blockedBy: blocked.map((provider) => provider.name),
    linking: linkingStatus(),
    cache: cacheStats(),
  });
}
