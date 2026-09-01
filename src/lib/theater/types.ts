export type TeamSide = "amber" | "sapphire";

export type RosterSource = "statlocker" | "deadlock-api" | "fixtures";

export interface PlayerIdentity {
  accountId: number;
  steamId64: string;
  personaName: string | null;
  avatarUrl: string | null;
  steamProfileUrl: string;
}

export interface MatchPlayer extends PlayerIdentity {
  heroId: number | null;
  heroName: string | null;
  heroIconUrl: string | null;
  team: TeamSide | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  won: boolean | null;
  /** Normalised Twitch login, when the player has a channel linked. */
  twitchLogin: string | null;
  /**
   * Where the link came from, in increasing order of trust: "manual" (operator
   * config), "statlocker" (self-reported on their profile), "verified" (the
   * player proved ownership of both accounts here).
   */
  twitchLinkSource: "manual" | "statlocker" | "verified" | "fixtures" | null;
  isViewer: boolean;
  rankLabel: string | null;
  rankBadgeUrl: string | null;
}

export interface TwitchChannelSummary {
  userId: string;
  login: string;
  displayName: string;
  profileImageUrl: string | null;
  channelUrl: string;
  isLive: boolean;
  liveGameName: string | null;
}

export interface VodSummary {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  createdAt: string;
  durationSeconds: number;
  viewCount: number;
}

/**
 * One player-in-one-match paired with the broadcast that covered it. This is
 * the unit the UI renders as a playable card.
 */
export interface Encounter {
  id: string;
  matchId: number;
  kind: "vod" | "live";
  player: MatchPlayer;
  channel: TwitchChannelSummary;
  vod: VodSummary | null;
  /** Seconds into the VOD where the match begins (already includes pre-roll). */
  offsetSeconds: number;
  overlapSeconds: number;
  /** Fraction of the match covered by the broadcast, 0-1. */
  coverage: number;
  confidence: "full" | "partial";
  /** Deep link that opens the moment on twitch.tv. */
  watchUrl: string;
}

export interface TheaterMatch {
  matchId: number;
  /** Unix seconds. */
  startTime: number;
  endTime: number;
  durationSeconds: number;
  gameMode: string | null;
  matchMode: string | null;
  rosterSource: RosterSource;
  viewerHeroName: string | null;
  viewerHeroIconUrl: string | null;
  viewerKills: number | null;
  viewerDeaths: number | null;
  viewerAssists: number | null;
  viewerWon: boolean | null;
  players: MatchPlayer[];
  encounters: Encounter[];
  statlockerUrl: string;
}

export interface TheaterStats {
  matchesScanned: number;
  playersScanned: number;
  linkedChannels: number;
  encounters: number;
  matchesWithEncounters: number;
  elapsedMs: number;
}

export interface TheaterResult {
  mode: "live" | "demo";
  viewer: PlayerIdentity;
  matches: TheaterMatch[];
  stats: TheaterStats;
  warnings: string[];
}

export interface ResolvedCandidate extends PlayerIdentity {
  matchesLast30Days: number | null;
}
