"use client";

import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } from "@/lib/theater/limits";

export interface SearchFormProps {
  query: string;
  matchLimit: number;
  busy: boolean;
  onQueryChange: (query: string) => void;
  onMatchLimitChange: (limit: number) => void;
  onSubmit: () => void;
}

const LIMIT_OPTIONS = [5, DEFAULT_MATCH_LIMIT, 15, MAX_MATCH_LIMIT];

export function SearchForm({
  query,
  matchLimit,
  busy,
  onQueryChange,
  onMatchLimitChange,
  onSubmit,
}: SearchFormProps) {
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="sr-only" htmlFor="steam-input">
        Steam ID, profile URL, or player name
      </label>
      <input
        id="steam-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Steam ID, steamcommunity.com/id/you, or player name"
        autoComplete="off"
        spellCheck={false}
        className="flex-1 rounded-lg border border-white/10 bg-ink-900/70 px-4 py-3 text-white placeholder:text-white/25 focus:border-twitch/60 focus:outline-none focus:ring-2 focus:ring-twitch/25"
      />

      <label className="sr-only" htmlFor="match-limit">
        Matches to scan
      </label>
      <select
        id="match-limit"
        value={matchLimit}
        onChange={(event) => onMatchLimitChange(Number(event.target.value))}
        className="rounded-lg border border-white/10 bg-ink-900/70 px-3 py-3 text-white focus:border-twitch/60 focus:outline-none"
      >
        {LIMIT_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option} matches
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={busy || query.trim().length === 0}
        className="rounded-lg bg-twitch px-6 py-3 font-semibold text-white transition hover:bg-twitch-bright disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? "Searching\u2026" : "Find VODs"}
      </button>
    </form>
  );
}
