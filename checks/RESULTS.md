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
