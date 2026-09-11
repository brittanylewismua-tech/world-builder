/**
 * ONE DEFINITION OF "THIS WEEK", FOR EVERYBODY.
 *
 * There were two. The browser filed an issue under the seller's LOCAL Monday;
 * the cron and the writer filed it under the UTC Monday. Those are the same
 * date from Los Angeles and from London, which is why nobody saw it — and they
 * disagree for part of every week for anybody east of UTC.
 *
 * When they disagree, the page looks for an issue filed under a date the
 * server never wrote. It finds nothing, concludes the week is unwritten, and
 * offers the button to research it again — spending that seller's one weekly
 * write on a paper they already had, and replacing the one they were reading.
 *
 * The same two-frames-in-one-system mistake ran the drop schedule away to
 * fourteen hundred drops. So the frame is chosen once, here, and imported.
 *
 * UTC IS THE FRAME, AND THAT IS DELIBERATE. The alternative — teach the server
 * each seller's timezone — buys a rollover that happens at local midnight and
 * costs a column, a lookup on every path that touches a date, and a new way
 * for the two to drift apart. What matters is that both halves agree, not
 * which Monday they agree on: the masthead says "Week of September 7" and
 * being a few hours out at the boundary is invisible. Being charged twice for
 * one week is not.
 */

/** Monday of the week containing `at`, as YYYY-MM-DD, in UTC. */
export function weekStart(at: Date = new Date()): string {
  const d = new Date(at);
  /* getUTCDay(): 0 = Sunday. Shift so Monday starts the week. */
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** The current UTC calendar day, as YYYY-MM-DD. */
export function todayISO(at: Date = new Date()): string {
  return new Date(at).toISOString().slice(0, 10);
}
