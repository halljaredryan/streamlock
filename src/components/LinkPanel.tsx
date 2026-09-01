"use client";

import { useCallback, useEffect, useState } from "react";

interface SessionState {
  linking: { enabled: boolean; detail: string };
  steam: { accountId: number; personaName: string | null; steamId64: string } | null;
  twitch: { userId: string; login: string; displayName: string } | null;
  link: {
    accountId: number;
    twitchLogin: string;
    twitchDisplayName: string;
    linkedAt: string;
  } | null;
}

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
          done
            ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300"
            : "border-white/15 bg-white/5 text-white/50"
        }`}
        aria-hidden="true"
      >
        {done ? "\u2713" : index}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-white">{title}</h3>
        <div className="mt-1 text-sm text-white/50">{children}</div>
      </div>
    </li>
  );
}

export function LinkPanel() {
  const [state, setState] = useState<SessionState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
      setState((await response.json()) as SessionState);
    } catch {
      setError("Could not read the current linking state.");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const failure = params.get("error");
    if (failure) setError(failure);
    if (params.get("steam") === "ok") setNotice("Steam account verified.");
    if (params.get("twitch") === "ok") setNotice("Twitch account verified.");
    if (failure || params.has("steam") || params.has("twitch")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    void refresh();
  }, [refresh]);

  const commit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/links", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save the link.");
      setNotice("Linked. Your VODs will now be matched to your Deadlock games.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the link.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const unlink = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/links", { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove the link.");
      setNotice("Link removed.");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove the link.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setNotice("Signed out. Stored links are unaffected.");
    await refresh();
  }, [refresh]);

  if (!state) {
    return <div className="panel rounded-2xl p-6 text-sm text-white/40">Loading&hellip;</div>;
  }

  if (!state.linking.enabled) {
    return (
      <div className="rounded-xl border border-yellow-400/25 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-100/90">
        <p className="font-semibold">Linking is disabled</p>
        <p className="mt-1">{state.linking.detail}</p>
      </div>
    );
  }

  const bothVerified = Boolean(state.steam && state.twitch);
  const alreadyLinked =
    state.link && state.twitch && state.link.twitchLogin === state.twitch.login;

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      )}

      <div className="panel rounded-2xl p-5">
        <ol className="space-y-5">
          <Step index={1} title="Verify your Steam account" done={Boolean(state.steam)}>
            {state.steam ? (
              <p>
                Signed in as{" "}
                <span className="text-white">
                  {state.steam.personaName ?? `account ${state.steam.accountId}`}
                </span>{" "}
                <span className="font-mono text-xs text-white/30">
                  ({state.steam.steamId64})
                </span>
              </p>
            ) : (
              <>
                <p>Steam confirms the account is yours. Streamlock never sees your password.</p>
                <a
                  href="/api/auth/steam"
                  className="mt-2 inline-block rounded-lg bg-white/10 px-4 py-2 font-medium text-white transition hover:bg-white/20"
                >
                  Sign in through Steam
                </a>
              </>
            )}
          </Step>

          <Step index={2} title="Connect your Twitch channel" done={Boolean(state.twitch)}>
            {state.twitch ? (
              <p>
                Connected as <span className="text-white">{state.twitch.displayName}</span>{" "}
                <span className="font-mono text-xs text-white/30">({state.twitch.login})</span>
              </p>
            ) : (
              <>
                <p>
                  No permissions are requested &mdash; the sign-in only proves you own the channel,
                  and the token is discarded immediately afterwards.
                </p>
                <a
                  href="/api/auth/twitch"
                  className="mt-2 inline-block rounded-lg bg-twitch px-4 py-2 font-medium text-white transition hover:bg-twitch-bright"
                >
                  Connect Twitch
                </a>
              </>
            )}
          </Step>

          <Step index={3} title="Save the link" done={Boolean(alreadyLinked)}>
            {alreadyLinked ? (
              <p>
                <span className="text-white">{state.link?.twitchDisplayName}</span> is linked to this
                Steam account. Anyone who played with you will now see your VODs.
              </p>
            ) : (
              <p>
                {bothVerified
                  ? "Both accounts are verified. Saving the link lets other players find your VODs from matches you shared."
                  : "Complete both steps above first."}
              </p>
            )}
          </Step>
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={commit}
            disabled={!bothVerified || busy || Boolean(alreadyLinked)}
            className="rounded-lg bg-twitch px-5 py-2.5 font-semibold text-white transition hover:bg-twitch-bright disabled:cursor-not-allowed disabled:opacity-40"
          >
            {alreadyLinked ? "Linked" : "Save link"}
          </button>

          {state.link && (
            <button
              type="button"
              onClick={unlink}
              disabled={busy}
              className="rounded-lg border border-white/15 px-4 py-2.5 text-sm text-white/60 transition hover:border-red-400/40 hover:text-red-200 disabled:opacity-40"
            >
              Unlink
            </button>
          )}

          {(state.steam || state.twitch) && (
            <button
              type="button"
              onClick={signOut}
              className="ml-auto text-sm text-white/35 transition hover:text-white/70"
            >
              Sign out
            </button>
          )}
        </div>
      </div>

      {state.link && !alreadyLinked && (
        <p className="text-sm text-white/40">
          This Steam account is currently linked to{" "}
          <span className="text-white/70">{state.link.twitchLogin}</span>. Saving again will replace
          it.
        </p>
      )}
    </div>
  );
}
