import Link from "next/link";

import { TheaterApp } from "@/components/TheaterApp";

const STEPS = [
  {
    title: "Recent games",
    body: "Your Steam account is resolved to a Deadlock account id, and the Deadlock API returns your recent match list.",
  },
  {
    title: "Linked channels",
    body: "Statlocker returns the full roster of every match plus each player's linked Twitch username.",
  },
  {
    title: "Broadcast windows",
    body: "For each linked channel, Twitch VOD timelines are intersected with the match window to find who was live.",
  },
  {
    title: "Cued playback",
    body: "Every hit becomes an embedded player that starts seconds before the match did, so you see it from their side.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-twitch-bright">
            Deadlock &middot; Statlocker &middot; Twitch
          </p>
          <Link
            href="/link"
            className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 transition hover:border-twitch/50 hover:text-white"
          >
            Link your accounts
          </Link>
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-white sm:text-5xl">Streamlock</h1>
        <p className="mt-3 max-w-2xl text-lg text-white/55">
          See your Deadlock matches from the other side. Streamlock finds the players in your recent
          games who stream on Twitch, then jumps straight to the moment your match started in their
          VOD.
        </p>
      </header>

      <TheaterApp />

      <section className="mt-14 border-t border-white/5 pt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-white/40">
          How it works
        </h2>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="panel rounded-xl p-4">
              <span className="text-xs font-mono text-twitch-bright">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 font-semibold text-white">{step.title}</h3>
              <p className="mt-1 text-sm text-white/45">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-12 border-t border-white/5 pt-6 text-xs text-white/30">
        <p>
          Inspired by{" "}
          <a
            href="https://guardian.theater"
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-white/20 transition hover:text-white/60"
          >
            Guardian Theater
          </a>
          , which does the same thing for Destiny 2.
        </p>
        <p className="mt-1">
          Match and profile data powered by{" "}
          <a
            href="https://statlocker.gg"
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-white/20 transition hover:text-white/60"
          >
            Statlocker
          </a>{" "}
          and{" "}
          <a
            href="https://deadlock-api.com"
            target="_blank"
            rel="noreferrer noopener"
            className="underline decoration-white/20 transition hover:text-white/60"
          >
            Deadlock API
          </a>
          . Not affiliated with Valve or Twitch.
        </p>
      </footer>
    </main>
  );
}
