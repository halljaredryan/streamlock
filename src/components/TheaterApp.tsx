"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { CandidatePicker } from "@/components/CandidatePicker";
import { MatchCard } from "@/components/MatchCard";
import { SearchForm } from "@/components/SearchForm";
import { type ProviderStatusView, SetupNotice, WarningList } from "@/components/SetupNotice";
import { DEFAULT_MATCH_LIMIT } from "@/lib/theater/limits";
import type { PlayerIdentity, ResolvedCandidate, TheaterResult } from "@/lib/theater/types";

type Phase = "idle" | "resolving" | "choosing" | "scanning" | "ready" | "error";

interface ResolveResponse {
  kind?: "exact" | "candidates";
  player?: ResolvedCandidate | PlayerIdentity;
  players?: ResolvedCandidate[];
  error?: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Unexpected response from server (${response.status})`);
  }
}

export function TheaterApp() {
  const [query, setQuery] = useState("");
  const [matchLimit, setMatchLimit] = useState(DEFAULT_MATCH_LIMIT);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ResolvedCandidate[]>([]);
  const [result, setResult] = useState<TheaterResult | null>(null);
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null);
  const [onlyWithVods, setOnlyWithVods] = useState(true);
  const [providers, setProviders] = useState<ProviderStatusView[]>([]);
  const [serverMode, setServerMode] = useState<"live" | "demo">("live");

  const busy = phase === "resolving" || phase === "scanning";

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data: { providers?: ProviderStatusView[]; mode?: "live" | "demo" }) => {
        setProviders(data.providers ?? []);
        setServerMode(data.mode ?? "live");
      })
      .catch(() => setProviders([]));
  }, []);

  const scan = useCallback(
    async (accountId: number, limit: number, label?: string | null) => {
      setPhase("scanning");
      setError(null);
      setCandidates([]);
      setActiveEncounterId(null);

      try {
        const response = await fetch(`/api/theater?accountId=${accountId}&matches=${limit}`);
        const data = await readJson<TheaterResult & { error?: string }>(response);
        if (!response.ok) throw new Error(data.error ?? `Scan failed (${response.status})`);

        setResult(data);
        setPhase("ready");
        if (label) setQuery(label);

        const url = new URL(window.location.href);
        url.searchParams.set("steam", String(accountId));
        url.searchParams.set("matches", String(limit));
        window.history.replaceState(null, "", url.toString());
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Scan failed");
        setPhase("error");
      }
    },
    [],
  );

  const submit = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    setPhase("resolving");
    setError(null);
    setCandidates([]);

    try {
      const response = await fetch(`/api/resolve?q=${encodeURIComponent(trimmed)}`);
      const data = await readJson<ResolveResponse>(response);
      if (!response.ok) throw new Error(data.error ?? `Lookup failed (${response.status})`);

      if (data.kind === "candidates" && data.players?.length) {
        setCandidates(data.players);
        setPhase("choosing");
        return;
      }
      if (data.player) {
        await scan(data.player.accountId, matchLimit, data.player.personaName);
        return;
      }
      throw new Error("Could not resolve that player");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Lookup failed");
      setPhase("error");
    }
  }, [matchLimit, query, scan]);

  // Restore a shared link: ?steam=<accountId>&matches=<n>
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const steam = params.get("steam");
    const matches = Number(params.get("matches"));
    if (!steam) return;

    const accountId = Number(steam);
    if (!Number.isSafeInteger(accountId) || accountId <= 0) return;

    const limit = Number.isSafeInteger(matches) && matches > 0 ? matches : DEFAULT_MATCH_LIMIT;
    setQuery(steam);
    setMatchLimit(limit);
    void scan(accountId, limit);
  }, [scan]);

  const visibleMatches = useMemo(() => {
    if (!result) return [];
    return onlyWithVods
      ? result.matches.filter((match) => match.encounters.length > 0)
      : result.matches;
  }, [onlyWithVods, result]);

  return (
    <div className="space-y-6">
      {/* In demo mode no upstream is called, so missing keys are not a problem. */}
      {serverMode === "demo" ? (
        <p className="rounded-xl border border-twitch/30 bg-twitch/10 px-4 py-3 text-sm text-white/70">
          <span className="font-semibold text-white">Demo mode.</span> Serving a canned dataset, so
          searches are ignored and the Twitch player cannot load the synthetic VODs. Unset{" "}
          <code className="font-mono text-xs">STREAMLOCK_DEMO</code> to use live data.
        </p>
      ) : (
        <SetupNotice providers={providers} />
      )}

      <SearchForm
        query={query}
        matchLimit={matchLimit}
        busy={busy}
        onQueryChange={setQuery}
        onMatchLimitChange={setMatchLimit}
        onSubmit={submit}
      />

      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      {phase === "choosing" && candidates.length > 0 && (
        <CandidatePicker
          candidates={candidates}
          onSelect={(candidate) => void scan(candidate.accountId, matchLimit, candidate.personaName)}
          onDismiss={() => {
            setCandidates([]);
            setPhase("idle");
          }}
        />
      )}

      {busy && (
        <div className="panel rounded-2xl p-6 text-sm text-white/50">
          <p className="font-medium text-white/70">
            {phase === "resolving" ? "Looking up that account\u2026" : "Scanning matches\u2026"}
          </p>
          <p className="mt-1">
            Pulling recent games, checking who linked a Twitch channel, then searching each
            channel&rsquo;s VOD timeline for the match window.
          </p>
        </div>
      )}

      {/* Kept visible on "error" so a failed retry does not discard the
          results the user was already looking at. */}
      {result && (phase === "ready" || phase === "error") && (
        <>
          <div className="panel flex flex-wrap items-center justify-between gap-4 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-3">
              {result.viewer.avatarUrl ? (
                <img
                  src={result.viewer.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded border border-white/10"
                />
              ) : (
                <div className="h-10 w-10 rounded border border-white/10 bg-white/5" />
              )}
              <div>
                <a
                  href={result.viewer.steamProfileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-semibold text-white transition hover:text-twitch-bright"
                >
                  {result.viewer.personaName ?? `Account ${result.viewer.accountId}`}
                </a>
                <p className="text-xs text-white/40">
                  {result.stats.encounters} clip
                  {result.stats.encounters === 1 ? "" : "s"} across {result.stats.matchesScanned}{" "}
                  matches &middot; {result.stats.linkedChannels} linked channel
                  {result.stats.linkedChannels === 1 ? "" : "s"} &middot;{" "}
                  {(result.stats.elapsedMs / 1000).toFixed(1)}s
                </p>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm text-white/50">
              <input
                type="checkbox"
                checked={onlyWithVods}
                onChange={(event) => setOnlyWithVods(event.target.checked)}
                className="h-4 w-4 accent-[var(--color-twitch)]"
              />
              Only matches with footage
            </label>
          </div>

          <WarningList warnings={result.warnings} />

          {visibleMatches.length === 0 ? (
            <div className="panel rounded-2xl p-6 text-sm text-white/50">
              <p className="font-medium text-white/70">No footage found in these matches.</p>
              <p className="mt-1">
                Either nobody in your recent games has a Twitch channel linked on Statlocker, or
                their VODs have already expired. Try scanning more matches, or untick
                &ldquo;only matches with footage&rdquo; to see the rosters.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleMatches.map((match) => (
                <MatchCard
                  key={match.matchId}
                  match={match}
                  activeEncounterId={activeEncounterId}
                  onActivate={setActiveEncounterId}
                  onDeactivate={() => setActiveEncounterId(null)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
