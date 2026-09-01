/**
 * The Streamlock pipeline.
 *
 *   Steam account
 *     -> recent Deadlock matches            (Deadlock API)
 *     -> full roster for each match         (Statlocker, Deadlock API fallback)
 *     -> which of those players linked Twitch (Statlocker profiles + local registry)
 *     -> which of those channels were broadcasting during the match (Twitch Helix)
 *     -> playable, time-offset VOD links    (the UI)
 *
 * Every upstream call is batched and cached, and every optional provider
 * degrades into a warning rather than a failure.
 */

import { mapLimit, unique } from "@/lib/async";
import {
  type DeadlockBulkMatch,
  type DeadlockMatchHistoryEntry,
  type DeadlockSteamProfile,
  getMatchHistory,
  getMatchesWithPlayers,
  getSteamProfiles,
  parseDeadlockTimestamp,
  searchPlayers,
} from "@/lib/deadlock/client";
import { type HeroInfo, getHeroesSafe } from "@/lib/deadlock/heroes";
import { HttpError } from "@/lib/http";
import { getTwitchLinks } from "@/lib/links/registry";
import {
  type StatlockerMatch,
  type StatlockerProfile,
  getMatches as getStatlockerMatches,
  getProfiles as getStatlockerProfiles,
  isStatlockerConfigured,
  parseStatlockerDate,
} from "@/lib/statlocker/client";
import { describeRank } from "@/lib/statlocker/rank";
import { accountIdToSteamId64, steamProfileUrl } from "@/lib/steam/id";
import { isTwitchConfigured } from "@/lib/twitch/auth";
import {
  type TwitchBroadcast,
  type TwitchStream,
  type TwitchUser,
  getArchivesSince,
  getStreamsByLogin,
  getUsersByLogin,
} from "@/lib/twitch/client";
import {
  channelUrl,
  computeOverlap,
  isMeaningfulOverlap,
  normaliseTwitchLogin,
  resolveThumbnail,
  vodWatchUrl,
} from "@/lib/twitch/vod";
import type {
  Encounter,
  MatchPlayer,
  PlayerIdentity,
  ResolvedCandidate,
  RosterSource,
  TeamSide,
  TheaterMatch,
  TheaterResult,
} from "@/lib/theater/types";

import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } from "@/lib/theater/limits";

export { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT };

export class PipelineError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PipelineError";
    this.status = status;
  }
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export async function resolveIdentity(accountId: number): Promise<PlayerIdentity> {
  const profiles = await getSteamProfiles([accountId]);
  const profile = profiles.get(accountId);
  return {
    accountId,
    steamId64: accountIdToSteamId64(accountId),
    personaName: profile?.personaname ?? null,
    avatarUrl: profile?.avatarfull ?? profile?.avatarmedium ?? profile?.avatar ?? null,
    steamProfileUrl: profile?.profileurl ?? steamProfileUrl(accountId),
  };
}

export async function findCandidates(query: string, limit = 8): Promise<ResolvedCandidate[]> {
  const results = await searchPlayers(query, limit);
  return results.map((profile) => ({
    accountId: profile.account_id,
    steamId64: accountIdToSteamId64(profile.account_id),
    personaName: profile.personaname ?? null,
    avatarUrl: profile.avatarfull ?? profile.avatarmedium ?? profile.avatar ?? null,
    steamProfileUrl: profile.profileurl ?? steamProfileUrl(profile.account_id),
    matchesLast30Days: profile.matches_played_last_30d ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Roster normalisation                                                       */
/* -------------------------------------------------------------------------- */

interface NormalisedMatch {
  matchId: number;
  startTime: number;
  durationSeconds: number;
  gameMode: string | null;
  matchMode: string | null;
  rosterSource: RosterSource;
  players: Array<{
    accountId: number;
    heroId: number | null;
    team: TeamSide | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    won: boolean | null;
    personaName: string | null;
    avatarUrl: string | null;
    ppScore: number | null;
    rankNumber: number | null;
  }>;
}

function statlockerTeam(team: string | null | undefined): TeamSide | null {
  if (!team) return null;
  const value = team.toLowerCase();
  if (value.includes("amber")) return "amber";
  if (value.includes("sapphire")) return "sapphire";
  return null;
}

function deadlockTeam(team: string | null | undefined): TeamSide | null {
  if (!team) return null;
  const value = team.toLowerCase();
  if (value === "team0") return "amber";
  if (value === "team1") return "sapphire";
  return null;
}

function fromStatlocker(match: StatlockerMatch): NormalisedMatch {
  return {
    matchId: match.matchId,
    startTime: parseStatlockerDate(match.matchDate),
    durationSeconds: match.matchDurationSeconds,
    gameMode: null,
    matchMode: null,
    rosterSource: "statlocker",
    players: (match.players ?? []).map((player) => ({
      accountId: player.account_id,
      heroId: player.hero_id ?? null,
      team: statlockerTeam(player.team),
      kills: player.kills ?? null,
      deaths: player.deaths ?? null,
      assists: player.assists ?? null,
      won: player.playerWon ?? null,
      personaName: player.steamProfile?.name ?? null,
      avatarUrl: player.steamProfile?.avatarUrl ?? null,
      ppScore: player.steamProfile?.ppScore ?? null,
      rankNumber: player.steamProfile?.estimatedRankNumber ?? null,
    })),
  };
}

function fromDeadlock(match: DeadlockBulkMatch): NormalisedMatch {
  const winningTeam = deadlockTeam(match.winning_team);
  return {
    matchId: match.match_id,
    startTime: parseDeadlockTimestamp(match.start_time),
    durationSeconds: match.duration_s,
    gameMode: match.game_mode ?? null,
    matchMode: match.match_mode ?? null,
    rosterSource: "deadlock-api",
    players: (match.players ?? []).map((player) => {
      const team = deadlockTeam(player.team);
      return {
        accountId: player.account_id,
        heroId: player.hero_id ?? null,
        team,
        kills: player.kills ?? null,
        deaths: player.deaths ?? null,
        assists: player.assists ?? null,
        won: winningTeam && team ? winningTeam === team : null,
        personaName: null,
        avatarUrl: null,
        ppScore: null,
        rankNumber: null,
      };
    }),
  };
}

/**
 * Statlocker is the preferred roster source because it returns Steam persona
 * names inline. Anything it doesn't have is backfilled from the Deadlock API in
 * a single bulk request.
 */
async function loadRosters(
  history: DeadlockMatchHistoryEntry[],
  warnings: string[],
): Promise<Map<number, NormalisedMatch>> {
  const matchIds = history.map((entry) => entry.match_id);
  const rosters = new Map<number, NormalisedMatch>();

  if (isStatlockerConfigured()) {
    try {
      const statlockerMatches = await getStatlockerMatches(matchIds);
      for (const [matchId, match] of statlockerMatches) {
        if (!match.players?.length) continue;
        rosters.set(matchId, fromStatlocker(match));
      }
    } catch (error) {
      warnings.push(describeProviderError("Statlocker match lookup", error));
    }
  }

  const missing = matchIds.filter((matchId) => !rosters.has(matchId));
  if (missing.length > 0) {
    try {
      for (const match of await getMatchesWithPlayers(missing)) {
        if (!match.players?.length) continue;
        rosters.set(match.match_id, fromDeadlock(match));
      }
    } catch (error) {
      warnings.push(describeProviderError("Deadlock API roster lookup", error));
    }
  }

  return rosters;
}

function describeProviderError(context: string, error: unknown): string {
  if (error instanceof HttpError) {
    if (error.isAuthFailure) return `${context} was rejected (${error.status}) — check the API key.`;
    if (error.isRateLimited) return `${context} hit its rate limit — results may be incomplete.`;
    return `${context} failed (${error.status || "network error"}).`;
  }
  return `${context} failed: ${error instanceof Error ? error.message : String(error)}`;
}

/* -------------------------------------------------------------------------- */
/* Twitch link discovery                                                      */
/* -------------------------------------------------------------------------- */

interface TwitchLink {
  login: string;
  source: "manual" | "statlocker" | "verified";
}

async function discoverTwitchLinks(
  accountIds: number[],
  warnings: string[],
): Promise<Map<number, TwitchLink>> {
  const links = new Map<number, TwitchLink>();

  const registry = await getTwitchLinks();
  for (const accountId of accountIds) {
    const entry = registry.get(accountId);
    if (entry) links.set(accountId, { login: entry.login, source: entry.source });
  }

  if (!isStatlockerConfigured()) {
    warnings.push(
      "No Statlocker API key configured, so self-reported Twitch usernames could not be read. Only accounts linked here, or listed in data/twitch-links.json, were used.",
    );
    return links;
  }

  let profiles = new Map<number, StatlockerProfile>();
  try {
    profiles = await getStatlockerProfiles(accountIds);
  } catch (error) {
    warnings.push(describeProviderError("Statlocker profile lookup", error));
    return links;
  }

  for (const [accountId, profile] of profiles) {
    const login = normaliseTwitchLogin(profile.twitchUsername);
    if (!login) continue;
    // Statlocker's value is self-reported, so it supersedes operator config but
    // never a link whose ownership was actually proved here.
    if (links.get(accountId)?.source === "verified") continue;
    links.set(accountId, { login, source: "statlocker" });
  }

  return links;
}

/* -------------------------------------------------------------------------- */
/* Main entry point                                                           */
/* -------------------------------------------------------------------------- */

export interface RunTheaterOptions {
  accountId: number;
  matchLimit?: number;
  /** Skip Steam Game Coordinator calls; faster and not rate limited. */
  onlyStoredHistory?: boolean;
}

export async function runTheater(options: RunTheaterOptions): Promise<TheaterResult> {
  const startedAt = Date.now();
  const matchLimit = Math.max(1, Math.min(options.matchLimit ?? DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT));
  const warnings: string[] = [];

  if (!isTwitchConfigured()) {
    throw new PipelineError(
      "Twitch credentials are missing. Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.",
      428,
    );
  }

  const [viewer, heroes, history] = await Promise.all([
    resolveIdentity(options.accountId),
    getHeroesSafe(),
    getMatchHistory(options.accountId, {
      limit: matchLimit,
      onlyStored: options.onlyStoredHistory ?? false,
    }),
  ]);

  if (history.length === 0) {
    return {
      mode: "live",
      viewer,
      matches: [],
      stats: emptyStats(Date.now() - startedAt),
      warnings: [
        "No tracked Deadlock matches found for this account. Matches appear once they are ingested by the Deadlock API.",
      ],
    };
  }

  const rosters = await loadRosters(history, warnings);

  const rosterAccountIds = unique(
    [...rosters.values()].flatMap((match) => match.players.map((player) => player.accountId)),
  );
  const links = await discoverTwitchLinks(rosterAccountIds, warnings);

  // Only players with a linked channel need Twitch lookups.
  const logins = unique([...links.values()].map((link) => link.login));

  let channels = new Map<string, TwitchUser>();
  let liveStreams = new Map<string, TwitchStream>();
  if (logins.length > 0) {
    try {
      [channels, liveStreams] = await Promise.all([
        getUsersByLogin(logins),
        getStreamsByLogin(logins),
      ]);
    } catch (error) {
      warnings.push(describeProviderError("Twitch channel lookup", error));
    }
  }

  const earliestStart = Math.min(...history.map((entry) => entry.start_time));
  const broadcastsByUserId = new Map<string, TwitchBroadcast[]>();

  await mapLimit([...channels.values()], 4, async (channel) => {
    try {
      broadcastsByUserId.set(channel.id, await getArchivesSince(channel.id, earliestStart));
    } catch (error) {
      warnings.push(describeProviderError(`Twitch VOD lookup for ${channel.login}`, error));
      broadcastsByUserId.set(channel.id, []);
    }
  });

  // The Deadlock roster fallback carries no persona names, so backfill them for
  // the players we are actually going to render a card for.
  const namedAccountIds = new Set<number>();
  for (const match of rosters.values()) {
    for (const player of match.players) {
      if (player.personaName) namedAccountIds.add(player.accountId);
    }
  }
  const missingNames = [...links.keys()].filter((accountId) => !namedAccountIds.has(accountId));

  let steamNames = new Map<number, DeadlockSteamProfile>();
  if (missingNames.length > 0) {
    try {
      steamNames = await getSteamProfiles(missingNames);
    } catch (error) {
      warnings.push(describeProviderError("Steam profile lookup", error));
    }
  }

  const matches: TheaterMatch[] = [];
  let playersScanned = 0;

  for (const entry of history) {
    const roster = rosters.get(entry.match_id);
    const startTime = roster?.startTime ?? entry.start_time;
    const durationSeconds = roster?.durationSeconds ?? entry.match_duration_s;
    const endTime = startTime + durationSeconds;

    const players: MatchPlayer[] = (roster?.players ?? []).map((player) => {
      const link = links.get(player.accountId);
      const hero = player.heroId != null ? heroes.get(player.heroId) : undefined;
      const steam = steamNames.get(player.accountId);
      const rank = describeRank(player.ppScore, player.rankNumber);

      return {
        accountId: player.accountId,
        steamId64: accountIdToSteamId64(player.accountId),
        personaName: player.personaName ?? steam?.personaname ?? null,
        avatarUrl: player.avatarUrl ?? steam?.avatarfull ?? steam?.avatar ?? null,
        steamProfileUrl: steamProfileUrl(player.accountId),
        heroId: player.heroId,
        heroName: hero?.name ?? null,
        heroIconUrl: hero?.iconUrl ?? null,
        team: player.team,
        kills: player.kills,
        deaths: player.deaths,
        assists: player.assists,
        won: player.won,
        twitchLogin: link?.login ?? null,
        twitchLinkSource: link?.source ?? null,
        isViewer: player.accountId === options.accountId,
        rankLabel: rank?.label ?? null,
        rankBadgeUrl: rank?.badgeUrl ?? null,
      };
    });

    playersScanned += players.length;

    const encounters = buildEncounters({
      matchId: entry.match_id,
      startTime,
      endTime,
      players,
      channels,
      liveStreams,
      broadcastsByUserId,
    });

    const viewerHero = heroes.get(entry.hero_id);
    matches.push({
      matchId: entry.match_id,
      startTime,
      endTime,
      durationSeconds,
      gameMode: roster?.gameMode ?? null,
      matchMode: roster?.matchMode ?? null,
      rosterSource: roster?.rosterSource ?? "deadlock-api",
      viewerHeroName: viewerHero?.name ?? null,
      viewerHeroIconUrl: viewerHero?.iconUrl ?? null,
      viewerKills: entry.player_kills ?? null,
      viewerDeaths: entry.player_deaths ?? null,
      viewerAssists: entry.player_assists ?? null,
      viewerWon: entry.match_result === entry.player_team,
      players,
      encounters,
      statlockerUrl: `https://statlocker.gg/match/${entry.match_id}`,
    });
  }

  const encounterCount = matches.reduce((total, match) => total + match.encounters.length, 0);

  return {
    mode: "live",
    viewer,
    matches,
    stats: {
      matchesScanned: matches.length,
      playersScanned,
      linkedChannels: channels.size,
      encounters: encounterCount,
      matchesWithEncounters: matches.filter((match) => match.encounters.length > 0).length,
      elapsedMs: Date.now() - startedAt,
    },
    warnings,
  };
}

interface BuildEncountersArgs {
  matchId: number;
  startTime: number;
  endTime: number;
  players: MatchPlayer[];
  channels: Map<string, TwitchUser>;
  liveStreams: Map<string, TwitchStream>;
  broadcastsByUserId: Map<string, TwitchBroadcast[]>;
}

function buildEncounters(args: BuildEncountersArgs): Encounter[] {
  const { matchId, startTime, endTime, players, channels, liveStreams, broadcastsByUserId } = args;
  const encounters: Encounter[] = [];
  const matchWindow = { startSeconds: startTime, endSeconds: endTime };

  for (const player of players) {
    if (!player.twitchLogin) continue;
    const channel = channels.get(player.twitchLogin);
    if (!channel) continue;

    const stream = liveStreams.get(player.twitchLogin);
    const channelSummary = {
      userId: channel.id,
      login: channel.login,
      displayName: channel.display_name || channel.login,
      profileImageUrl: channel.profile_image_url ?? null,
      channelUrl: channelUrl(channel.login),
      isLive: Boolean(stream),
      liveGameName: stream?.game_name ?? null,
    };

    const broadcasts = broadcastsByUserId.get(channel.id) ?? [];
    let matched = false;

    for (const broadcast of broadcasts) {
      const overlap = computeOverlap(matchWindow, {
        startSeconds: broadcast.startSeconds,
        endSeconds: broadcast.endSeconds,
      });
      if (!overlap || !isMeaningfulOverlap(overlap)) continue;

      matched = true;
      encounters.push({
        id: `${matchId}:${player.accountId}:v${broadcast.video.id}`,
        matchId,
        kind: "vod",
        player,
        channel: channelSummary,
        vod: {
          id: broadcast.video.id,
          title: broadcast.video.title,
          url: broadcast.video.url,
          thumbnailUrl: resolveThumbnail(broadcast.video.thumbnail_url),
          createdAt: broadcast.video.created_at,
          durationSeconds: broadcast.durationSeconds,
          viewCount: broadcast.video.view_count ?? 0,
        },
        offsetSeconds: overlap.offsetSeconds,
        overlapSeconds: overlap.overlapSeconds,
        coverage: overlap.coverage,
        confidence: overlap.confidence,
        watchUrl: vodWatchUrl(broadcast.video.id, overlap.offsetSeconds),
      });
    }

    // A stream that is still running has no VOD entry yet (or the channel does
    // not save broadcasts), so fall back to the live channel when the match
    // happened inside the current session.
    if (!matched && stream) {
      const streamStart = Math.floor(Date.parse(stream.started_at) / 1000);
      const overlap = computeOverlap(matchWindow, {
        startSeconds: streamStart,
        endSeconds: Math.floor(Date.now() / 1000),
      });
      if (overlap && isMeaningfulOverlap(overlap)) {
        encounters.push({
          id: `${matchId}:${player.accountId}:live`,
          matchId,
          kind: "live",
          player,
          channel: channelSummary,
          vod: null,
          offsetSeconds: 0,
          overlapSeconds: overlap.overlapSeconds,
          coverage: overlap.coverage,
          confidence: overlap.confidence,
          watchUrl: channelUrl(channel.login),
        });
      }
    }
  }

  return encounters.sort(
    (a, b) =>
      Number(b.player.isViewer) - Number(a.player.isViewer) ||
      b.coverage - a.coverage ||
      (b.vod?.viewCount ?? 0) - (a.vod?.viewCount ?? 0),
  );
}

function emptyStats(elapsedMs: number) {
  return {
    matchesScanned: 0,
    playersScanned: 0,
    linkedChannels: 0,
    encounters: 0,
    matchesWithEncounters: 0,
    elapsedMs,
  };
}
