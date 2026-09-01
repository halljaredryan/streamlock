/**
 * Statlocker exposes skill as `ppScore`, a roughly linear integer. Rank numbers
 * are TIER * 10 + SUBRANK and are deliberately non-contiguous (17-20, 27-30 …
 * are skipped), so always sort on ppScore and use rank numbers for display only.
 */

const TIER_NAMES = [
  "Initiate",
  "Seeker",
  "Acolyte",
  "Sentinel",
  "Mystic",
  "Ritualist",
  "Emissary",
  "Oracle",
  "Phantom",
  "Ascendant",
  "Eternus",
] as const;

export function ppScoreToRankNumber(ppScore: number): number {
  const seq = Math.max(1, Math.min(66, Math.floor(ppScore / 100)));
  const tier = Math.floor((seq - 1) / 6) + 1;
  const subrank = ((seq - 1) % 6) + 1;
  return tier * 10 + subrank;
}

export function rankNumberToName(rankNumber: number): string {
  const tier = Math.floor(rankNumber / 10);
  const subrank = rankNumber % 10;
  const name = TIER_NAMES[tier - 1];
  return name ? `${name} ${subrank}` : "Unranked";
}

export function rankBadgeUrl(rankNumber: number): string {
  const tier = Math.floor(rankNumber / 10);
  const subrank = rankNumber % 10;
  return `https://assets.deadlock-api.com/images/ranks/rank${tier}/badge_lg_subrank${subrank}.webp`;
}

export function describeRank(
  ppScore: number | null | undefined,
  estimatedRankNumber?: number | null,
): { label: string; badgeUrl: string } | null {
  const rankNumber =
    estimatedRankNumber ?? (typeof ppScore === "number" ? ppScoreToRankNumber(ppScore) : null);
  if (!rankNumber) return null;
  return { label: rankNumberToName(rankNumber), badgeUrl: rankBadgeUrl(rankNumber) };
}
