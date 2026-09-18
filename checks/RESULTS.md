# Whole-world read — what was proven, and how

`npm run check:world` runs the shipped text of `pickAcrossWorld`, cut out of
the route file rather than retyped, so the checks cannot drift from what
deploys. 19 checks, all passing.

The two below were verified in the deployed interface as well, because a
structural check cannot tell you what a member sees.

## Already current is not a failure — live, 2026-09-18T12:16Z

Build `62f6b25`. Pressed "Read it again" on a world whose wall had not moved
since its last read — the exact case where the read is declined before paid
admission.

| | observed |
|---|---|
| red failure box (`ErrorNote`) | **absent** |
| "already current" wording | **shown**, in the quiet grey line |
| the cached brief | **open and readable** |
| allowance | **1 of 2 left this week — unchanged** |

Before this, the same press returned `error` with a 429: askAI threw, the
page rendered it in the red box, the cached brief stayed closed because
`setWorldOpen(true)` only ran on the success path, and it was filed in the
admin error log as a fault. Nothing had actually gone wrong.

## The world read itself — live, 2026-09-18T04:00Z

Build `afa0247`. A member reported that "Read my world" answered "There are
not enough designs under this keyword to find a pattern in" with ten keywords
on the wall. The whole-world read had never worked: the query that fetches
the designs filtered on `keyword` unconditionally, and a world read has none.

After the fix the read ran and returned a brief citing four different
corners — Womens march, Mediocre Men, Well-Behaved Women, Burn the Patriarchy
— which is `pickAcrossWorld` doing its job, not just the query fix.

## Two defects found by the durability pass, measured against the prior build

- A design saved under three keywords came back `DUPE,DUPE,DUPE,C1,B1,B2`:
  half the slots were one photograph and three corners were represented by
  one design.
- Five shuffles of identical data produced five different picks, because the
  rows arrive with no `ORDER BY` and nothing broke ties.

Both are covered by checks 5, 5b and 6.

## Does Tara's bug class exist anywhere else? — 2026-09-18

Her bug was one shape: a value that is legitimately absent in one mode, used
in a query filter unconditionally, so the query silently matches nothing and
the caller reads the empty result as "no data" rather than "wrong question".
It is a quiet failure by nature — nothing throws — so it was worth checking
whether the same shape sits anywhere else.

Swept every `route.ts` under `src/app/api` for values the route itself treats
as possibly-absent (tested with `!x`, defaulted with `??`, or read with
`?.trim()`) that then reach `.eq()`, `.is()` or `.filter()`.

13 call sites flagged. All 13 examined by hand, all false positives:

| what was flagged | why it is safe |
|---|---|
| `shops/read` — `shopId` ×5 | `if (!worldId \|\| !shopId) return 400` before any use |
| `winners/read` — `keyword` ×2 | both guarded by an inline `if (!wholeWorld)`; the regex could not see a guard on the same line |
| `pinterest/refresh` — `target` | `if (!target) continue;` immediately above |
| `billing/checkout` — `who` ×2 | `who.id`, auth-gated and non-null |
| `admin/access` — `user` | `user.id`, same |
| `shops` — `saved` | `saved.id`, the row just inserted |

So the shape existed in exactly one place and that place is fixed. Recorded
because a clean sweep is only worth anything if the method is written down:
the value must be one the route knows can be missing, and the filter must be
reached without a branch.
