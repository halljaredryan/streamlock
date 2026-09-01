/**
 * Canned dataset for `STREAMLOCK_DEMO=1`.
 *
 * Statlocker reviews API keys by hand, so this exists to let the front end be
 * built and reviewed before credentials arrive. The shapes are identical to the
 * live pipeline's output. VOD ids are synthetic, so the embedded player will
 * report "video unavailable" — layout and interaction are what this is for.
 */

import { accountIdToSteamId64, steamProfileUrl } from "@/lib/steam/id";
import { channelUrl, vodWatchUrl } from "@/lib/twitch/vod";
import type { Encounter, MatchPlayer, TheaterMatch, TheaterResult } from "@/lib/theater/types";

const HEROES = [
  "Infernus",
  "Seven",
  "Vindicta",
  "Lady Geist",
  "Abrams",
  "Wraith",
  "McGinnis",
  "Paradox",
  "Dynamo",
  "Kelvin",
  "Haze",
  "Bebop",
];

const STREAMERS = [
  { login: "amberhandandy", display: "AmberHandAndy", hero: "Vindicta" },
  { login: "sapphiresundown", display: "SapphireSundown", hero: "Dynamo" },
  { login: "midlanemara", display: "MidlaneMara", hero: "Haze" },
];

const VIEWER_ACCOUNT_ID = 479799201;

function player(index: number, overrides: Partial<MatchPlayer> = {}): MatchPlayer {
  const accountId = 100_000_000 + index * 7_919;
  return {
    accountId,
    steamId64: accountIdToSteamId64(accountId),
    personaName: `Player ${index + 1}`,
    avatarUrl: null,
    steamProfileUrl: steamProfileUrl(accountId),
    heroId: index + 1,
    heroName: HEROES[index % HEROES.length] ?? null,
    heroIconUrl: null,
    team: index < 6 ? "amber" : "sapphire",
    kills: 3 + ((index * 3) % 11),
    deaths: 2 + ((index * 5) % 9),
    assists: 4 + ((index * 7) % 13),
    won: index < 6,
    twitchLogin: null,
    twitchLinkSource: null,
    isViewer: false,
    rankLabel: null,
    rankBadgeUrl: null,
    ...overrides,
  };
}

function buildMatch(args: {
  matchId: number;
  startTime: number;
  durationSeconds: number;
  viewerWon: boolean;
  streamerCount: number;
}): TheaterMatch {
  const { matchId, startTime, durationSeconds, viewerWon, streamerCount } = args;
  const endTime = startTime + durationSeconds;

  const players: MatchPlayer[] = Array.from({ length: 12 }, (_, index) => player(index));

  players[0] = player(0, {
    accountId: VIEWER_ACCOUNT_ID,
    steamId64: accountIdToSteamId64(VIEWER_ACCOUNT_ID),
    steamProfileUrl: steamProfileUrl(VIEWER_ACCOUNT_ID),
    personaName: "OogaChaka",
    heroName: "Lady Geist",
    isViewer: true,
    won: viewerWon,
    rankLabel: "Oracle 4",
  });

  const encounters: Encounter[] = [];

  STREAMERS.slice(0, streamerCount).forEach((streamer, index) => {
    const slot = 3 + index * 3;
    const linked = player(slot, {
      personaName: streamer.display,
      heroName: streamer.hero,
      twitchLogin: streamer.login,
      twitchLinkSource: "fixtures",
      rankLabel: index === 0 ? "Phantom 2" : "Emissary 5",
    });
    players[slot] = linked;

    const isLive = index === 0 && matchId % 2 === 0;
    const offsetSeconds = 1_800 + index * 940;
    const videoId = `${matchId}${index}`;

    encounters.push({
      id: `${matchId}:${linked.accountId}:${isLive ? "live" : `v${videoId}`}`,
      matchId,
      kind: isLive ? "live" : "vod",
      player: linked,
      channel: {
        userId: `${1_000_000 + index}`,
        login: streamer.login,
        displayName: streamer.display,
        profileImageUrl: null,
        channelUrl: channelUrl(streamer.login),
        isLive,
        liveGameName: isLive ? "Deadlock" : null,
      },
      vod: isLive
        ? null
        : {
            id: videoId,
            title: `${streamer.display} — Deadlock ranked grind`,
            url: `https://www.twitch.tv/videos/${videoId}`,
            thumbnailUrl: null,
            createdAt: new Date((startTime - offsetSeconds) * 1000).toISOString(),
            durationSeconds: 4 * 3_600,
            viewCount: 1_240 - index * 310,
          },
      offsetSeconds: isLive ? 0 : offsetSeconds,
      overlapSeconds: index === 2 ? Math.floor(durationSeconds * 0.4) : durationSeconds,
      coverage: index === 2 ? 0.4 : 1,
      confidence: index === 2 ? "partial" : "full",
      watchUrl: isLive ? channelUrl(streamer.login) : vodWatchUrl(videoId, offsetSeconds),
    });
  });

  return {
    matchId,
    startTime,
    endTime,
    durationSeconds,
    gameMode: "Normal",
    matchMode: "Ranked",
    rosterSource: "fixtures",
    viewerHeroName: "Lady Geist",
    viewerHeroIconUrl: null,
    viewerKills: 11,
    viewerDeaths: 6,
    viewerAssists: 14,
    viewerWon,
    players,
    encounters,
    statlockerUrl: `https://statlocker.gg/match/${matchId}`,
  };
}

export function buildDemoResult(): TheaterResult {
  const now = Math.floor(Date.now() / 1000);

  const matches = [
    buildMatch({
      matchId: 41525920,
      startTime: now - 2 * 3_600,
      durationSeconds: 2_174,
      viewerWon: true,
      streamerCount: 3,
    }),
    buildMatch({
      matchId: 41525903,
      startTime: now - 9 * 3_600,
      durationSeconds: 1_849,
      viewerWon: false,
      streamerCount: 1,
    }),
    buildMatch({
      matchId: 41525871,
      startTime: now - 31 * 3_600,
      durationSeconds: 2_540,
      viewerWon: true,
      streamerCount: 0,
    }),
  ];

  const encounters = matches.reduce((total, match) => total + match.encounters.length, 0);

  return {
    mode: "demo",
    viewer: {
      accountId: VIEWER_ACCOUNT_ID,
      steamId64: accountIdToSteamId64(VIEWER_ACCOUNT_ID),
      personaName: "OogaChaka",
      avatarUrl: null,
      steamProfileUrl: steamProfileUrl(VIEWER_ACCOUNT_ID),
    },
    matches,
    stats: {
      matchesScanned: matches.length,
      playersScanned: matches.length * 12,
      linkedChannels: STREAMERS.length,
      encounters,
      matchesWithEncounters: matches.filter((match) => match.encounters.length > 0).length,
      elapsedMs: 42,
    },
    // `mode: "demo"` is the machine-readable signal; the UI banners it.
    warnings: [],
  };
}
