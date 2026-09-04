/**
 * NUMBERS THE PAGE AND THE SERVER BOTH HAVE TO AGREE ON.
 *
 * Each of these was written out twice — once in the browser so a button knows
 * when to hide, and once in the route that enforces it. Two copies of a rule
 * drift, and when they drift the seller sees a button that cannot work, or a
 * limit that fires earlier than the page said it would.
 *
 * No "use client" here on purpose: this file has to be importable from both
 * sides, so it holds numbers only and pulls in nothing.
 */

/** Shops a world can follow at once. Reading five properly is a week's study. */
export const MOST_SHOPS = 5;

/**
 * Below this many views, a favorite rate says nothing — one viewer and one
 * favorite is 100%. Used to decide whether to show a percentage at all.
 */
export const ENOUGH_VIEWS = 150;

/** Keywords a world can hold on the World Winners wall. */
export const MOST_KEYWORDS = 10;

/* ------------------------------------------------------------------ */
/* the allowances                                                      */
/* ------------------------------------------------------------------ */

/**
 * How many times each AI feature may run, per person.
 *
 * These moved here from the server guard the moment the app started SHOWING
 * them. A cap the seller can see is a number two pieces of code have to agree
 * on, and this file exists because that agreement kept failing silently.
 *
 * The reasoning behind each number lives with the guard that enforces it.
 */
export const DAILY_CAP = {
  daily: 1,
  customer: 30,
  room: 30,
  areas: 5,
  board: 200,
  boardRead: 4,
  winners: 12,
  world: 2,
  shops: 12,
  shopAdds: 5,
  avatar: 2,
} as const;

export type Route = keyof typeof DAILY_CAP;

/** Allowances that run by the week rather than by the day. */
export const WEEKLY: ReadonlySet<Route> = new Set<Route>([
  "boardRead",
  "daily",
  "world",
  "shops",
  "shopAdds",
  "avatar",
]);

/**
 * WHEN A REMAINING COUNT IS WORTH SAYING OUT LOUD.
 *
 * Never at full. A counter visible from the first click turns a generous
 * ceiling into a meter running down, and every one of these is set so that a
 * heavy genuine week never reaches it — so for almost everybody the honest
 * number of times to mention it is zero.
 *
 * A quarter of the allowance, and never more than ten, so the warning arrives
 * while there is still room to act on it: three shop reads left, not fifty
 * board items left.
 */
export function warnAt(cap: number) {
  return Math.max(1, Math.min(Math.ceil(cap / 4), 10));
}

/**
 * HOW MUCH NEW WORK BEFORE A BOARD CAN BE READ AGAIN.
 *
 * The whole board goes into a pattern read, so a press that cannot change the
 * answer is the most expensive nothing in the product. Ten was too generous —
 * a Pinterest import brings fifty at once, so ten was reachable inside a
 * single afternoon of collecting, over and over.
 *
 * Thirty is about a real batch of new material: enough that the read has
 * something genuinely different to say, and roughly once or twice per drop
 * rather than whenever somebody is curious.
 */
export const NEW_BEFORE_REREAD = 30;
