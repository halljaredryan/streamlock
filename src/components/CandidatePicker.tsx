"use client";

import type { ResolvedCandidate } from "@/lib/theater/types";

export interface CandidatePickerProps {
  candidates: ResolvedCandidate[];
  onSelect: (candidate: ResolvedCandidate) => void;
  onDismiss: () => void;
}

export function CandidatePicker({ candidates, onSelect, onDismiss }: CandidatePickerProps) {
  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-white">Which player are you?</h2>
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs text-white/40 transition hover:text-white"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-sm text-white/45">
        Persona names are not unique. Pick the account whose matches you want to scan.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => (
          <li key={candidate.accountId}>
            <button
              type="button"
              onClick={() => onSelect(candidate)}
              className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-ink-900/50 px-3 py-2 text-left transition hover:border-twitch/50 hover:bg-ink-800"
            >
              {candidate.avatarUrl ? (
                <img
                  src={candidate.avatarUrl}
                  alt=""
                  className="h-9 w-9 rounded border border-white/10"
                  loading="lazy"
                />
              ) : (
                <div className="h-9 w-9 rounded border border-white/10 bg-white/5" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-white">
                  {candidate.personaName ?? `Account ${candidate.accountId}`}
                </span>
                <span className="block truncate text-xs text-white/40">
                  {candidate.matchesLast30Days !== null
                    ? `${candidate.matchesLast30Days} matches in the last 30 days`
                    : `Account ${candidate.accountId}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
