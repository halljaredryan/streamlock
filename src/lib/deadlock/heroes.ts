import { TTL, cached } from "@/lib/cache";
import { env } from "@/lib/env";
import { buildUrl, requestJson } from "@/lib/http";

interface HeroAsset {
  id: number;
  name: string;
  images?: {
    icon_image_small_webp?: string | null;
    icon_image_small?: string | null;
    minimap_image_webp?: string | null;
  } | null;
}

export interface HeroInfo {
  id: number;
  name: string;
  iconUrl: string | null;
}

export async function getHeroes(): Promise<Map<number, HeroInfo>> {
  return cached("deadlock:heroes", TTL.heroes, async () => {
    const target = buildUrl(env.deadlock.assetsBaseUrl, "/v2/heroes", { only_active: "true" });
    const heroes = await requestJson<HeroAsset[]>(target, { label: "deadlock-assets" });
    const map = new Map<number, HeroInfo>();
    for (const hero of heroes ?? []) {
      if (typeof hero?.id !== "number") continue;
      map.set(hero.id, {
        id: hero.id,
        name: hero.name ?? `Hero ${hero.id}`,
        iconUrl:
          hero.images?.icon_image_small_webp ??
          hero.images?.icon_image_small ??
          hero.images?.minimap_image_webp ??
          null,
      });
    }
    return map;
  });
}

/** Never throws: hero names are cosmetic and must not fail the pipeline. */
export async function getHeroesSafe(): Promise<Map<number, HeroInfo>> {
  try {
    return await getHeroes();
  } catch {
    return new Map();
  }
}
