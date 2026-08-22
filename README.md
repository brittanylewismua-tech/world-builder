# World Builder

World-building software for print-on-demand sellers. A tool used inside the
world-building challenge, sold separately beyond it.

**`SPEC.md` is the governing document.** If something in the code is not
traceable to it, that is a bug.

---

## Deploy

Double-click **`deploy.command`**. First run signs you into Vercel and asks a
few setup questions; every run after that pushes the current code live.

Or from a terminal in this folder: `npm install && npx vercel --prod`

### After the first deploy — three things, in order

1. **Vercel → Settings → Environment Variables** → add `ANTHROPIC_API_KEY`.
   Without it, World Daily, the Creative Room, and Talk to the Customer all
   show a clear message instead of working.
2. **Supabase → Authentication → URL Configuration** → add the Vercel URL to
   the redirect allowlist. Magic-link sign-in silently fails otherwise. This is
   the one that looks broken if you skip it.
3. **Vercel → Settings → Deployment Protection** → turn off Vercel
   Authentication so people other than you can load it.

Then redeploy.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Yes** | From console.anthropic.com. Server-side only. |
| `WB_MODEL` | No | Defaults to `claude-sonnet-5`. |
| `NEXT_PUBLIC_SUPABASE_URL` | No | Falls back to the project baked into `src/lib/supabase.ts`. |
| `NEXT_PUBLIC_SUPABASE_KEY` | No | Publishable key. Public by design — RLS is the boundary. |

---

## What is built

| Phase | Surface | State |
|---|---|---|
| 1 | World Profile + WORLD setup | Built |
| 2 | Drop Studio | Built |
| 3 | World Daily | Built |
| 4 | Talk to the Customer | Built |
| 5 | Drop History | Built |
| 6 | Data + Deepen | Not started — deliberately last |

### WORLD setup

`W` at least 6 eRank-validated sub-niches, entered by the seller, no cap, and
the screen says plainly that the tool does not check demand · `O` four 1–10
affinity questions, never scored, never a verdict · `R` ~6 visual calibration
uploads · `L` the active world areas the seller chooses · `D` name the world.

Worlds are discovered bottom-up: the seller names the world at the *end*,
looking at their own keywords.

### Drop Studio

70/30. Board left — shop banner (upload, or a colour block derived from the
world name), `DROP 01`, the Friday date, `0 / 10`, ten Etsy-style tiles, six
board backgrounds. Creative Room right, which sends the actual mockups to the
model as images so it is looking at the collection, not being told about it.

Schedule is pure calendar. Pause any time. Publish & freeze ships early.

### World Daily

Searches the seller's chosen areas, distills to ~5 items, and **verifies every
source URL against what the search tool actually returned** — an item whose
link cannot be verified is dropped rather than shown. Never says "make a shirt
about this."

### Drop History

Frozen boards, chronological, with lifecycle labels only: Building, Live,
Gathering Data (30d), Ready to Review (60d). Never a verdict.

---

## Data

Supabase project `ywncfltxrnrchicjwcse`, tables prefixed `wb_`. RLS on every
table, owner-scoped. Private storage bucket keyed on user ID. Magic-link auth,
no passwords. No secret keys ship anywhere.

**Known debt:** these tables share a project with Goldie because the intended
project's database password is rejecting connections and a third project would
have cost money. Isolated and safe, but worth moving before this is sold.

---

## Structure

```
SPEC.md                        the governing document
src/lib/world.ts               World Profile types, affinity questions
src/lib/api.ts                 world CRUD, image upload, signed URLs
src/lib/worldActions.ts        shared write handlers (setup + profile)
src/lib/drops.ts               schedule, freeze, lifecycle, mockups
src/lib/daily.ts               issue load/generate
src/app/setup                  the WORLD flow
src/app/studio                 Drop Board + Creative Room
src/app/daily                  the newspaper
src/app/customer               Talk to the Customer
src/app/history                the archive
src/app/profile                four independently editable modules
src/app/api/creative-room      contextual AI, vision over the board
src/app/api/world-daily        research + source verification
src/app/api/customer           the persona
```
