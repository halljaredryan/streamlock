"use client";

import { TwitchLoader } from "@/components/TwitchLoader";
import { formatClock, formatCompactNumber, formatKda } from "@/lib/format";
import type { Encounter } from "@/lib/theater/types";

const TEAM_TEXT = {
  amber: "text-amber-team",
  sapphire: "text-sapphire-team",
} as const;

const TEAM_CHIP = {
  amber: "border-amber-team/40 text-amber-team",
  sapphire: "border-sapphire-team/40 text-sapphire-team",
} as const;

// Display names only. The `amber`/`sapphire` keys mirror the vocabulary the
// upstream APIs still send ("Amber Hand"/"Sapphire Flame", Team0/Team1), so
// renaming them here would break roster parsing.
const TEAM_LABEL = {
  amber: "Hidden King",
  sapphire: "Archmother",
} as const;

export interface EncounterCardProps {
  encounter: Encounter;
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

export function EncounterCard({ encounter, active, onActivate, onDeactivate }: EncounterCardProps) {
  const { player, channel, vod } = encounter;
  const kda = formatKda(player.kills, player.deaths, player.assists);

  return (
    <article className="panel flex flex-col gap-3 rounded-xl p-3">
      <TwitchLoader
        kind={encounter.kind}
        videoId={vod?.id ?? null}
        channelLogin={channel.login}
        channelDisplayName={channel.displayName}
        offsetSeconds={encounter.offsetSeconds}
        posterUrl={vod?.thumbnailUrl ?? null}
        active={active}
        onActivate={onActivate}
        onDeactivate={onDeactivate}
      />

      <div className="flex items-start gap-3">
        {channel.profileImageUrl ? (
          <img
            src={channel.profileImageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full border border-white/10"
            loading="lazy"
          />
        ) : (
          <div className="h-9 w-9 shrink-0 rounded-full border border-white/10 bg-twitch/20" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={channel.channelUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate font-semibold text-white transition hover:text-twitch-bright"
            >
              {channel.displayName}
            </a>
            {channel.isLive && (
              <span className="shrink-0 rounded bg-red-600/90 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                Live
              </span>
            )}
          </div>

          <p className="truncate text-sm text-white/50">
            played as{" "}
            <span className={player.team ? TEAM_TEXT[player.team] : undefined}>
              {player.heroName ?? "an unknown hero"}
            </span>
            {player.personaName ? ` \u00b7 ${player.personaName}` : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {player.team && (
          <span className={`rounded border px-1.5 py-0.5 ${TEAM_CHIP[player.team]}`}>
            {TEAM_LABEL[player.team]}
          </span>
        )}
        {kda && (
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-white/60">{kda}</span>
        )}
        {player.rankLabel && (
          <span className="rounded border border-white/10 px-1.5 py-0.5 text-white/60">
            {player.rankLabel}
          </span>
        )}
        <span
          className={`rounded border px-1.5 py-0.5 ${
            encounter.confidence === "full"
              ? "border-emerald-400/30 text-emerald-300/80"
              : "border-yellow-400/30 text-yellow-300/80"
          }`}
          title={
            encounter.confidence === "full"
              ? "The broadcast covered the entire match"
              : "The broadcast covered only part of the match"
          }
        >
          {encounter.confidence === "full"
            ? "full match"
            : `${Math.round(encounter.coverage * 100)}% covered`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-xs text-white/40">
        <span className="truncate" title={vod?.title ?? undefined}>
          {encounter.kind === "live"
            ? channel.liveGameName
              ? `Streaming ${channel.liveGameName}`
              : "Streaming now"
            : `VOD at ${formatClock(encounter.offsetSeconds)}`}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {vod && <span>{formatCompactNumber(vod.viewCount)} views</span>}
          <a
            href={encounter.watchUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-twitch-bright transition hover:text-white"
          >
            Open on Twitch
          </a>
        </div>
      </div>
    </article>
  );
}
