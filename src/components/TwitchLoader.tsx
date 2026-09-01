"use client";

import { useEffect, useState } from "react";

import { formatClock } from "@/lib/format";
import { formatTwitchOffset } from "@/lib/twitch/vod";

/**
 * Twitch refuses to render an embed whose `parent` list does not include the
 * hostname of the embedding page, and that hostname is only knowable in the
 * browser. Reading it after mount also keeps the iframe out of the server render,
 * which avoids a hydration mismatch.
 */
function useTwitchParents(): string[] {
  const [parents, setParents] = useState<string[]>([]);

  useEffect(() => {
    const configured = (process.env.NEXT_PUBLIC_TWITCH_PARENTS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    setParents([...new Set([window.location.hostname, ...configured])]);
  }, []);

  return parents;
}

function buildEmbedUrl(args: {
  kind: "vod" | "live";
  videoId: string | null;
  channelLogin: string;
  offsetSeconds: number;
  parents: string[];
}): string {
  const params = new URLSearchParams();

  if (args.kind === "vod" && args.videoId) {
    params.set("video", `v${args.videoId}`);
    params.set("time", formatTwitchOffset(args.offsetSeconds));
  } else {
    params.set("channel", args.channelLogin);
  }

  for (const parent of args.parents) params.append("parent", parent);
  params.set("autoplay", "true");
  params.set("muted", "false");

  return `https://player.twitch.tv/?${params.toString()}`;
}

export interface TwitchLoaderProps {
  kind: "vod" | "live";
  videoId: string | null;
  channelLogin: string;
  channelDisplayName: string;
  offsetSeconds: number;
  posterUrl: string | null;
  /** When false the component shows a poster and loads nothing. */
  active: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
}

export function TwitchLoader({
  kind,
  videoId,
  channelLogin,
  channelDisplayName,
  offsetSeconds,
  posterUrl,
  active,
  onActivate,
  onDeactivate,
}: TwitchLoaderProps) {
  const parents = useTwitchParents();
  const isLive = kind === "live";
  const ready = active && parents.length > 0;

  if (!ready) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-ink-900 text-left"
        aria-label={`Load ${channelDisplayName}'s ${isLive ? "live stream" : "VOD"}`}
      >
        {posterUrl ? (
          // Twitch thumbnail hosts are allowlisted in next.config.ts, but these
          // are fixed-size CDN images so a plain img keeps the markup simple.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-70 transition group-hover:opacity-90"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(145,70,255,0.35),transparent_60%)]" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/30 to-transparent" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-twitch/90 shadow-lg shadow-twitch/30 transition group-hover:scale-110 group-hover:bg-twitch-bright">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
          <span className="text-xs font-medium tracking-wide text-white/80">
            {isLive ? "Watch live now" : `Jump to ${formatClock(offsetSeconds)}`}
          </span>
        </div>

        {isLive && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-twitch/40">
      <iframe
        data-twitch-player
        title={`${channelDisplayName} on Twitch`}
        src={buildEmbedUrl({ kind, videoId, channelLogin, offsetSeconds, parents })}
        className="absolute inset-0 h-full w-full"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      />
      <button
        type="button"
        onClick={onDeactivate}
        className="absolute right-2 top-2 z-10 rounded bg-ink-950/80 px-2 py-1 text-xs text-white/70 transition hover:bg-ink-950 hover:text-white"
      >
        Close
      </button>
    </div>
  );
}
