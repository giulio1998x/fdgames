# Stream Prize Games

Configurable prize games for live streams. A viewer pays an entry amount, the streamer triggers a
round from an OBS Browser Source, and the game decides a second amount the viewer then sends.

Prototype: amounts are tracked and displayed, but **nothing is charged** — no payment gateway, no
accounts, no Twitch integration.

## Which way the money flows

This matters for reading every number in the app. The result of a round is **money the viewer
sends**, not money the streamer pays out. There is no house edge and no losing config — a bigger
average result is simply a bigger average tribute.

Result screens show one figure: **the amount to send**. The admin panel shows the **average result
per play** and what that is as a multiple of the entry price.

## Running it

```bash
npm run dev
```

Then open http://localhost:3000.

## Routes

| Route              | What it is                                                               |
| ------------------ | ------------------------------------------------------------------------ |
| `/`                | Landing page — each game with a settings link and an overlay link        |
| `/admin`           | Streamer dashboard — every game, its live average, and a settings link   |
| `/admin/[game]`    | Full payout-table editor, with the EV updating as you type               |
| `/overlay/[game]`  | The OBS Browser Source view: transparent background, on-screen trigger   |
| `/api/config`      | `GET` every stored config                                                |
| `/api/config/[id]` | `GET` one config, `PUT` to save, `DELETE` to restore the shipped default |
| `/api/selftest`    | Runs the game-logic test suite and returns pass/fail JSON                |
| `/api/health`      | Which config store the deploy picked up — check this after going live    |

### Overlay query parameters

- `?entry=5` — the entry amount for the round, shown as context and used in the result math
- `?spins=1|5|10|25` — slots only, preselects the spin count
- `?balls=1|3|5` — plinko only, preselects the ball count
- `?poll=30` — how often, in seconds, this overlay re-checks the config. `0` turns it off.

Example: `http://localhost:3000/overlay/plinko?entry=1.23&balls=3`

The overlay polls `/api/config/[game]` every 20 seconds, so saving in `/admin` reaches a Browser
Source that is already open — no rebuild, no reload, no OBS restart. It also refetches whenever the
tab becomes visible again, which is usually the streamer coming back from `/admin`.

Twenty seconds is a compromise for serverless hosting, where every poll is a billed function
invocation. On a host that runs a normal long-lived process, `?poll=3` costs nothing extra.

## The games

Each game's logic lives in its own module under `lib/games/`, with no cross-imports between them.

### Wheel of Fortune — `lib/games/wheel.ts`

A Crazy Time layout: every slice is the same size, and a likelier result simply owns more of them.
`weight` is therefore a slice count, and chance works out to slices ÷ total slices, so the wheel you
see *is* the odds table. Slices are interleaved around the ring rather than grouped, so it reads €1,
€2, €1, ×2, €5, €1… Up to 20 sectors and 120 slices.

Sectors come in two kinds. A **paying sector** ends the round with an amount. A **multiplier
sector** pays nothing itself: landing it scales every amount on the board and hands the streamer a
respin. Multipliers chain — ×2 then ×3 leaves the board at ×6 — and the result breaks down as base
amount × the board multiplier. The streamer decides how many multiplier sectors there are, what
factor each carries, and how many slices each gets, the same as any other sector.

A peg sits on every slice boundary and a flapper hangs over the rim at 12 o'clock, Crazy Time
style. The spin runs off a timer rather than a CSS transition specifically so the flapper can know
the wheel's angle on every frame: it rides up the back of each peg, snaps off the front, and clicks
as it goes, with the deflection scaled by how fast the wheel is still turning. The pointer and the
wheel are therefore never out of step.

Multiplier sectors are drawn on the wheel in their own colour with a gold rim so they read at a
glance. A round can only chain so far: after eight multipliers the next spin is restricted to paying
sectors, and a board with no paying sector at all is rejected on save, since such a round could
never end.

The shipped board is 60 slices — 50 that pay and 10 that multiply — which averages €8.44 over about
1.2 spins on a €5 entry.

### Slot Machine — `lib/games/slots.ts`

No combinatorial reel matching. The row is drawn from the weighted table first; the picture is
chosen afterwards and never changes what the spin pays.

Each row describes a *shape* rather than one fixed triple, and every arrangement matching it is
generated: a cherry pair lands on reels 1+2, or 1+3, or 2+3, with any other symbol filling the gap.
The shapes are three of a kind, a pair with any third symbol, no match (three different symbols, so
a losing spin can never look like a win), or one fixed combination. Rows that accept several symbols
multiply out further — "triple fruit" covers lemon, orange and watermelon. The shipped table alone
comes to 863 distinct pictures, counted live in the editor with samples beside it.

Arrangements are drawn directly rather than enumerated first, so a row with thousands of pictures
costs nothing to pick from.

Each reel shows a **three-row window**. Only the middle row pays — it is picked out with a gold
frame and a marker either side, and the rows above and below are dimmed. Those neighbours exist for
the near misses: they lean toward the symbols already on the payline, so a third cherry often sits
one row above the two that landed.

Reels run at a **constant fast blur** — one symbol every 42ms, linear, no easing — and then each
one **slams to a stop** in turn with a short overshoot, the way an old mechanical reel drops into
its detent. There is no long glide to a halt. They stop left to right with the gaps widening, so the
deciding reel lands well after the other two, and the overlay names which reel is still running.

The streamer keeps **their own symbol set** in `/admin/slots` (any short string — emoji, a letter, a
few characters); the blur between stops is drawn from that same set. Spin duration is configurable.
1, 5, 10 or 25 spins per round, each resolved independently, with a running total and a per-spin
log — long rounds compress each spin so 25 of them stay watchable.

### Plinko — `lib/games/plinko.ts`

The landing slot is a weighted draw, and the ball genuinely bounces its way there. It steps one pin
left or right at every row along a shuffled sequence that reaches the chosen slot, and between pins
it is a projectile: it pops up off the pin it struck, arcs over, and accelerates down under gravity
into the next one, solving the fall time from `dy = v0*t + g*t^2/2`. Pins flash as they are hit.
Every drop looks different; the destination never moves.

Slots pay a **multiplier of the entry amount**, and weight is edited separately from the visual
layout. 1, 3 or 5 balls per round.

### Blackjack — `lib/games/blackjack.ts`

A real round, not a weighted draw. Single 52-card deck, standard values, ace as 1 or 11, dealer
draws to 17 and stands on all 17s. The result is a two-axis lookup: `base amount for the hand
outcome × multiplier for the result vs the dealer`.

The cards sit on a felt table with a wooden rim — a contained element, not a page background, so
the overlay stays transparent behind it. Cards slide in from the deck as they are dealt, and the
hole card is a real 3D turn rather than a swap: the face and the back are two sides of one element
rotating on its Y axis.

The overlay deals it out slowly enough to follow on stream: roughly a second per card — player card,
dealer upcard, player card, dealer hole card face down. The player decides against the visible
upcard; Stand turns the hole card, holds, then walks out the dealer's draws one at a time with a
beat between each before the result appears.

Beside the table is a **payout chart**: every hand outcome with its amount, the three result
multipliers, and — once the round settles — the two cells that applied highlighted with the live
arithmetic under them.

## Expected value

Shown live in `/admin` while you edit the odds.

- Slots: `EV = sum(amount × weight) / sum(weight)`
- Wheel: the same average over the paying sectors, but folded through the respin chain. A play is a
  run of multiplier hits followed by one paying sector, so with `pm` the chance of a multiplier,
  `M` its average factor and `A` the average paying amount, the value of a play is
  `A × pa / (1 − pm × M)` — summed to the chain cap rather than to infinity, which also keeps it
  finite when `pm × M ≥ 1`. The editor breaks out every term.
- Plinko: `EV = entryAmount × weightedAverageMultiplier` — it scales with whatever is staked, so the
  average multiplier is the number to tune
- Blackjack: no weights table to average, so its EV is **simulated** over 8,000 hands with the
  player hitting below 17 and standing at 17+. A ballpark, not an exact figure — it moves if a
  player plays differently.

## Config storage

Two drivers behind one interface in `lib/store.ts`:

- **file** — a flat JSON file at `data/games.json`, created on first save. This is what local
  development uses; it needs no setup at all.
- **blobs** — [Netlify Blobs](https://docs.netlify.com/blobs/overview/), used when the app detects
  it is running on Netlify, where the filesystem is read-only. Reads are strongly consistent on
  purpose: the streamer saves in `/admin` and expects the overlay's next poll to show it.

The driver is chosen automatically. `STORE_DRIVER=file|blobs` forces it, and `DATA_DIR` points the
file driver at a mounted disk on hosts that offer one.

Missing or corrupt config falls back to the shipped defaults rather than throwing, so a bad write
cannot take an overlay down mid-stream. Everything written passes through `lib/config-schema.ts`,
which coerces and clamps every field — admin input arrives as free-typed strings.

## Deploying

```bash
npm run build && npm start
```

Anywhere that runs a Node process works with no configuration. On **Netlify** the included
`netlify.toml` sets the build and pins Node 22, and the store switches itself to Blobs — there is
nothing to configure. After a deploy, `GET /api/health` reports which driver it picked; it must say
`blobs`, or the first Save will fail.

Two things to know before making the link public:

- **`/admin` has no password.** Anyone who finds the URL can rewrite the payout tables.
- **`/api/selftest` takes about 3 seconds locally** and may exceed a serverless function timeout.
  It is a development tool — delete `app/api/selftest/` if you would rather not ship it.

## Verifying the game logic

```bash
curl http://localhost:3000/api/selftest
```

133 checks over the weighted draw, the EV formulas, the wheel's slice layout and multiplier
sectors, its peg and flapper geometry, the slots pattern generator and reel strip, plinko's lattice
walk and bounce trajectory,
the full blackjack rule set, and config normalisation. Among them:

- a 200,000-draw distribution test against the configured odds
- 5,000 spins confirming the wheel always stops on the slice it drew
- 5,000 full wheel rounds confirming every one terminates on a paying sector, the chain never
  exceeds its cap, a multiplier sector never pays out itself, and the amount is always base × board
  multiplier
- 4,000 draws confirming a pair always shows exactly two of its symbol across all three placements,
  and that a no-match row never shows two matching reels
- 2,000 strips confirming the payline lands on the centre row and neighbours tease it often enough
  to read as near misses
- 2,000 drops confirming the ball never moves more than one pin per row
- the wheel's spin curve only ever decelerates, never runs backwards, and lands exactly on target
- one peg per slice, the peg index advancing exactly once per slice over a full turn, and the
  flapper riding up slowly then snapping off fast while staying inside its travel
- 20,000 blackjack rounds confirming the dealer never stands below 17 and a natural never resolves
  as a loss

Delete `app/api/selftest/` if you don't want the endpoint shipped.

## Sound

Every effect is synthesised with the Web Audio API — no audio files, so an OBS Browser Source has
nothing extra to fetch. The wheel clicks once per peg with the volume tracking its speed, reels
thunk as they stop, cards riffle as they are dealt and turned, pins ping, and results resolve into a
short rising or falling phrase.

Browsers block audio until a user gesture, so the context is created on the first trigger press.
There is a 🔊 toggle beside every overlay title, and the choice is remembered per browser — set it
once and the OBS source keeps it across restarts. Streamers who run their own stingers can mute it
and lose nothing else.

## Animation and OBS

No animation uses `requestAnimationFrame`. Some hosts throttle rAF to a standstill when a page is
offscreen — an OBS scene that isn't live, for one — which would strand a round mid-play with its
trigger stuck disabled. Everything runs on CSS transitions and timers instead, and Plinko's frame
index is derived from elapsed wall-clock time, so a throttled timer drops frames rather than
stretching the fall. Each drop also carries a settle timeout, so the round finishes even if the
ticker never fires at all.

## What is not built

No payment processing, no accounts or multi-tenancy, no Twitch API, and no visual design work — the
UI is deliberately plain.
