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
