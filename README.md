# Streamlock

**See your Deadlock matches from the other side.**

Streamlock takes a Steam account, pulls its recent Deadlock matches, finds which
of the other 11 players in each match have a Twitch channel linked, and then
works out which of those channels were actually broadcasting while the match was
being played. Every hit becomes an embedded Twitch player cued to the second the
match started.

It is the Deadlock equivalent of [Guardian Theater](https://guardian.theater),
which does the same thing for Destiny 2 using the Bungie API.

---

## How the matching works

Twitch has no "who was live at time T" query, so the problem is inverted:

1. **Resolve the account.** Any of a Steam account id, SteamID64, `STEAM_0:1:x`,
   `[U:1:x]`, a `steamcommunity.com` profile URL, or a persona name is reduced to
   the 32-bit Deadlock account id (`src/lib/steam/id.ts`). Ambiguous names go
   through Deadlock API's player search and the user picks.
2. **Recent games.** `GET /v1/players/{account_id}/match-history` on
   [Deadlock API](https://deadlock-api.com) returns the match list with
   `start_time` and `match_duration_s` — the match window.
3. **Rosters.** [Statlocker](https://statlocker.gg/api)'s
   `POST /api/public/matches` returns all 12 players per match (10 match ids per
   request) including inline Steam persona names. Without a Statlocker key,
   Deadlock API's bulk `/v1/matches/metadata` fills in as a roster source.
4. **Linked Twitch accounts.** `POST /api/public/profiles` (100 account ids per
   request) returns a `twitchUsername` for each player. This is opt-in data the
   players themselves entered on Statlocker — Streamlock never guesses a channel
   from a persona name. Links can also come from Streamlock's own verified
   linking flow or from operator config; see [Account linking](#account-linking)
   for the precedence rules.
5. **Broadcast windows.** For each linked channel, `GET /helix/videos`
   (`type=archive`, newest first) returns past broadcasts, each with a
   `created_at` and a `duration`. That gives an absolute
   `[start, start + duration]` window per VOD.
6. **Intersect.** `src/lib/twitch/vod.ts` intersects the match window with each
   broadcast window. Any overlap of 60 seconds or more becomes an *encounter*,
   with `offsetSeconds = matchStart - vodStart` (minus a 20-second pre-roll so
   playback opens on the loading screen). An overlap that fully contains the
   match is labelled `full`; anything else is `partial`.
7. **Render.** The UI turns each encounter into a click-to-load
   `player.twitch.tv` iframe at that offset. Channels that are still live and
   have no VOD yet fall back to a live embed.

Two details worth knowing: Twitch only retains VODs for 7–60 days depending on
the channel, so old matches legitimately return nothing; and a channel must have
"store past broadcasts" enabled at all.

---

## Requirements

- Node.js 20.9 or newer
- A Twitch application (required)
- A Statlocker API key (strongly recommended — it is the only source of linked
  Twitch usernames)

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev
```

Open http://localhost:3000.

Other scripts: `npm test` (Node's built-in runner, no framework), `npm run typecheck`,
`npm run build`.

### Getting keys

| Provider                                            | Needed for                            | Notes                                                                                                                       |
| --------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [Twitch](https://dev.twitch.tv/console/apps)         | Channel, VOD and live lookups         | Create a **confidential** app. Only the client id/secret are needed; no user login, since all data read is public.           |
| [Statlocker](https://statlocker.gg/api)              | Match rosters + linked Twitch usernames | Applications are reviewed by hand. Sign in with Steam on that page to apply.                                                 |
| [Deadlock API](https://deadlock-api.com)             | Recent match list, Steam personas     | Free, no key required. An optional patron key raises priority.                                                               |
| [Steam](https://steamcommunity.com/dev/apikey)       | `steamcommunity.com/id/<vanity>` URLs | Optional. A vanity segment is not a persona name, so without this key those URLs cannot be resolved and fall back to search. |

### Enabling account linking

Linking is optional and off until you set a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
# put the value in STREAMLOCK_SESSION_SECRET
```

You must also register the OAuth redirect URL on your Twitch app — for local
development that is `http://localhost:3000/api/auth/twitch/callback`. Twitch
requires an exact match; override the inferred value with `TWITCH_REDIRECT_URI`
if you serve the app from a different address, and set `STREAMLOCK_PUBLIC_URL`
when running behind a reverse proxy so redirects do not leak an internal host.

### Working without keys

`STREAMLOCK_DEMO=1` serves a canned dataset from
`src/lib/theater/fixtures.ts` so the interface can be built and reviewed before
credentials arrive. The VOD ids are synthetic, so the embedded player itself will
report the video as unavailable.

`GET /api/health` reports which providers are configured.

---

## Project layout

```
src/
  app/
    api/health/route.ts     provider configuration + cache stats
    api/resolve/route.ts    user input -> one account, or candidates to pick from
    api/theater/route.ts    the main pipeline endpoint
    api/auth/steam/         Steam OpenID begin + callback
    api/auth/twitch/        Twitch OAuth begin + callback
    api/auth/session/       current linking state; DELETE signs out
    api/links/route.ts      commit or remove a verified link
    page.tsx                landing page
    link/page.tsx           account linking page
  components/
    TheaterApp.tsx          client state machine: search -> resolve -> scan -> render
    LinkPanel.tsx           three-step linking flow
    SearchForm.tsx          account input + match count
    CandidatePicker.tsx     disambiguates persona-name searches
    MatchCard.tsx           one match: header, encounters, full roster
    EncounterCard.tsx       one player-in-one-match paired with a broadcast
    TwitchLoader.tsx        click-to-load twitch embed at a time offset
  lib/
    auth/session.ts         signed-cookie session (cookie <-> NextRequest/Response)
    auth/session-codec.ts   pure HMAC sign/verify/expiry core (tested)
    auth/steam-openid.ts    OpenID 2.0 begin + check_authentication verify
    auth/twitch-oauth.ts    authorization-code exchange, identity only
    links/registry.ts       merged link lookup with provenance
    links/store.ts          writable verified-link store (swap for a database)
    async.ts                bounded-concurrency map, chunking
    cache.ts                TTL cache with request coalescing (swap for Redis)
    env.ts                  configuration + provider status
    format.ts               duration/relative-time formatting
    http.ts                 fetch with timeouts, backoff, Retry-After handling
    time.ts                 upstream timestamp parsing (the UTC trap, see tests)
    steam/id.ts             SteamID64 <-> account id, input parsing
    deadlock/client.ts      match history, bulk rosters, Steam personas, search
    deadlock/heroes.ts      hero id -> name/icon
    statlocker/client.ts    batched match + profile lookups
    statlocker/rank.ts      ppScore -> rank name/badge
    twitch/auth.ts          app access token with refresh-on-401
    twitch/client.ts        Helix users/videos/streams, batched and cached
    twitch/vod.ts           duration parsing, window intersection, deep links
    links/registry.ts       manual account -> channel overrides
    theater/pipeline.ts     the orchestration described above
    theater/types.ts        shared result types
    theater/fixtures.ts     demo dataset
data/
  twitch-links.json         manual Steam account id -> Twitch login map
```

## Account linking

Statlocker's `twitchUsername` is self-reported and only covers players who filled
it in. Linking lets a player attach their own channel, and it is the mechanism
that grows coverage beyond Statlocker's field.

**Both sides must be proved, or the feature is a griefing tool.** Writing a link
requires two independently verified identities in the same session:

- **Steam**, via OpenID 2.0 (`src/lib/auth/steam-openid.ts`). The callback query
  string is attacker-controlled, so the claimed id is only trusted after Steam
  confirms its own signature through `check_authentication`. Skipping that step
  would let anyone claim any account.
- **Twitch**, via the OAuth authorization-code flow
  (`src/lib/auth/twitch-oauth.ts`). No scopes are requested, since proving
  ownership needs none; the token is used once to read the login and then
  revoked. A CSRF `state` value is held in the signed session and burned on use.

`POST /api/links` reads both identities from the session cookie only — the client
never supplies an account id. The cookie is JSON plus an HMAC
(`src/lib/auth/session-codec.ts`), so a tampered payload is rejected outright.

### Link precedence

When the same player has links from more than one source, the most trustworthy
wins:

| Source        | Origin                                            | Trust                              |
| ------------- | ------------------------------------------------- | ---------------------------------- |
| `verified`    | This linking flow                                 | Ownership of both sides proved     |
| `statlocker`  | The player's Statlocker profile                   | Self-reported, unverified          |
| `manual`      | `data/twitch-links.json` / `STREAMLOCK_TWITCH_LINKS` | Operator-supplied                  |

### What is stored

Only public identifiers: the Steam account id, and the Twitch user id, login and
display name. No access token is kept and no password is ever seen. Unlinking
deletes the record.

`src/lib/links/store.ts` writes `data/verified-links.json` (gitignored) with
serialised writes and an atomic rename. That is correct for a single instance but
wrong for serverless or multi-instance deployments, where the filesystem is
ephemeral or unshared — implement the `LinkStore` interface against your database
and change `getLinkStore()`.

## Rate limits and caching

Upstream quotas are the binding constraint, so every provider call is batched
and memoised through `src/lib/cache.ts`:

| Data                | TTL    | Why                                        |
| ------------------- | ------ | ------------------------------------------ |
| Match history       | 5 min  | New matches appear continuously            |
| Match rosters       | 24 h   | Immutable once a match ends                |
| Profiles            | 30 min | A player may link Twitch at any time       |
| Twitch VOD listings | 10 min | New VODs appear when a stream ends         |
| Live streams        | 1 min  | Volatile                                   |
| Hero assets         | 24 h   | Effectively static                         |

Statlocker allows 1,000 match requests and 10,000 account requests per hour per
key, billed per item on batch endpoints. A 10-match scan costs 10 match items and
up to 120 account items.

The cache is process-local. Running more than one instance means each has its own
copy, which is correct but wasteful — `cached()` in `src/lib/cache.ts` is the
single seam to point at Redis.

### Why an app access token, not user OAuth

Streamlock authenticates to Twitch with the client credentials grant
(`src/lib/twitch/auth.ts`). Every endpoint it reads — `Get Users`, `Get Videos`,
`Get Streams` — accepts an app access token, and all the data is public. A
visitor's user token would grant no extra visibility into a *third party's* VODs,
which is the only thing being looked up, and requiring a login would break the
core use case of scanning matches for players who never visit the site.

The tradeoff is rate limiting. Twitch gives an app one shared 800 points/minute
bucket, whereas user tokens are bucketed per client id *per user*. Batching and
caching keep a scan to a handful of points, so the shared bucket is not the
constraint yet, but note that it is shared across all visitors — there is
currently no per-IP throttle on `/api/theater`.

User OAuth is still the right tool for a few things, as a separate flow rather
than a replacement:

- **Account linking** — implemented, see [Account linking](#account-linking). It
  requests no scopes, reads the login once, and revokes the token.
- **Clip creation**, since `POST /helix/clips` requires the `clips:edit` scope.
- **`user:read:follows`**, to surface channels the visitor already follows.

Sub-only VODs are unaffected by this choice: the embed plays in the visitor's
browser using their own Twitch session.

## Known gaps

These are deliberate omissions in this foundation, not oversights:

- **Links are the only persisted data.** Verified links go to a JSON file;
  everything else is recomputed per request and held in an in-process cache.
  Encounters are not indexed.
- **The link store is single-instance.** See
  [Account linking](#account-linking); it needs a database before horizontal
  scaling or serverless deployment.
- **No abuse controls.** `/api/theater` has no per-IP throttle, so one visitor
  can drain the shared Twitch and Statlocker quotas. The cache absorbs repeats,
  but a rate limiter belongs in front of the pipeline.
- **No email or profile data from Twitch.** Deliberate: linking requests zero
  scopes, so there is nothing to leak.
- **No Twitch clip support.** Only VODs and live channels. Helix
  `/helix/clips` per broadcaster within the match window would add the
  highlight-reel angle.
- **No background indexing.** A worker that crawls `/helix/videos?game_id=<deadlock>`
  would let the site show footage for players who never visit it.
- **Match window precision.** Timings come from match start plus duration; there
  is no per-kill timestamping, so the offset lands on the match start rather than
  on specific fights.

## Attribution

Match and profile data from [Statlocker](https://statlocker.gg) and
[Deadlock API](https://deadlock-api.com). Concept from
[Guardian Theater](https://guardian.theater). Not affiliated with Valve or
Twitch.
