import Link from "next/link";

import { LinkPanel } from "@/components/LinkPanel";

export const metadata = {
  title: "Link your accounts — Streamlock",
  description:
    "Prove you own a Steam account and a Twitch channel so other players can find your VODs from matches you shared.",
};

export default function LinkAccountsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link
        href="/"
        className="text-sm text-white/40 transition hover:text-white/70"
      >
        &larr; Back to search
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Link your accounts
        </h1>
        <p className="mt-3 text-white/55">
          Streamlock reads linked Twitch usernames from Statlocker profiles. Linking here instead
          proves ownership of both sides, so your channel is matched even if you never filled that
          field in &mdash; and it takes precedence over the self-reported value.
        </p>
      </header>

      <LinkPanel />

      <section className="mt-12 border-t border-white/5 pt-6 text-sm text-white/40">
        <h2 className="font-semibold uppercase tracking-[0.15em] text-white/35">
          What gets stored
        </h2>
        <ul className="mt-3 space-y-1.5">
          <li>
            Your Steam account id and your Twitch login, display name and user id &mdash; all
            public information.
          </li>
          <li>
            No Twitch access token. The sign-in requests no scopes and the token is revoked as soon
            as your username has been read.
          </li>
          <li>No password ever reaches Streamlock; Steam and Twitch handle sign-in themselves.</li>
          <li>Unlinking removes the record entirely.</li>
        </ul>
      </section>
    </main>
  );
}
