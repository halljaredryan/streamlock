"use client";

import { useState } from "react";

import { EncounterCard } from "@/components/EncounterCard";
import { formatDateTime, formatDuration, formatKda, formatRelativeTime } from "@/lib/format";
import type { TheaterMatch } from "@/lib/theater/types";

const ROSTER_SOURCE_LABEL: Record<string, string> = {
  statlocker: "roster via Statlocker",
  "deadlock-api": "roster via Deadlock API",
  fixtures: "demo roster",
};

export interface MatchCardProps {
  match: TheaterMatch;
  activeEncounterId: string | null;
  onActivate: (encounterId: string) => void;
  onDeactivate: () => void;
}

export function MatchCard({ match, activeEncounterId, onActivate, onDeactivate }: MatchCardProps) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const kda = formatKda(match.viewerKills, match.viewerDeaths, match.viewerAssists);
  const linkedCount = match.players.filter((player) => player.twitchLogin).length;

  return (
    <section className="panel rounded-2xl p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {match.viewerHeroIconUrl && (
            <img
              src={match.viewerHeroIconUrl}
              alt=""
              className="h-10 w-10 rounded-lg border border-white/10 bg-ink-900 object-contain"
              loading="lazy"
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-white">
                {match.viewerHeroName ?? `Match ${match.matchId}`}
              </h2>
              {match.viewerWon !== null && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-bold uppercase ${
                    match.viewerWon
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {match.viewerWon ? "Win" : "Loss"}
                </span>
              )}
            </div>
            <p className="text-sm text-white/45" title={formatDateTime(match.startTime)}>
              {formatRelativeTime(match.startTime)} &middot; {formatDuration(match.durationSeconds)}
              {kda ? ` \u00b7 ${kda}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>{ROSTER_SOURCE_LABEL[match.rosterSource] ?? match.rosterSource}</span>
          <a
            href={match.statlockerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="transition hover:text-white"
          >
            #{match.matchId}
          </a>
        </div>
      </header>

      {match.encounters.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {match.encounters.map((encounter) => (
            <EncounterCard
              key={encounter.id}
              encounter={encounter}
              active={activeEncounterId === encounter.id}
              onActivate={() => onActivate(encounter.id)}
              onDeactivate={onDeactivate}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-white/10 px-3 py-4 text-sm text-white/35">
          {linkedCount === 0
            ? "Nobody in this match has a Twitch account linked."
            : `${linkedCount} linked ${linkedCount === 1 ? "channel" : "channels"} in this match, but no broadcast covered it. VODs expire after 7-60 days.`}
        </p>
      )}

      <button
        type="button"
        onClick={() => setRosterOpen((open) => !open)}
        className="mt-4 text-xs text-white/40 transition hover:text-white/70"
        aria-expanded={rosterOpen}
      >
        {rosterOpen ? "Hide" : "Show"} all {match.players.length} players
      </button>

      {rosterOpen && (
        <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {match.players.map((player) => (
            <li
              key={player.accountId}
              className="flex items-center justify-between gap-2 rounded border border-white/5 bg-ink-900/40 px-2 py-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    player.team === "amber"
                      ? "bg-amber-team"
                      : player.team === "sapphire"
                        ? "bg-sapphire-team"
                        : "bg-white/20"
                  }`}
                />
                <a
                  href={player.steamProfileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate text-white/70 transition hover:text-white"
                >
                  {player.personaName ?? `Account ${player.accountId}`}
                </a>
                {player.isViewer && (
                  <span className="shrink-0 rounded bg-white/10 px-1 text-[10px] uppercase text-white/60">
                    you
                  </span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-2 text-xs text-white/35">
                <span>{player.heroName ?? "-"}</span>
                {player.twitchLogin && (
                  <a
                    href={`https://www.twitch.tv/${player.twitchLogin}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-twitch-bright transition hover:text-white"
                    title={`Twitch link from ${player.twitchLinkSource}`}
                  >
                    twitch
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
