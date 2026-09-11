import { type World } from "./world";
import { formatDropDate, type Drop } from "./drops";

/**
 * THE PARTS OF THE SHARED MEMORY THAT DO NOT NEED A BROWSER.
 *
 * buildWorldContext lives in a "use client" module and reads through the
 * signed-in seller's own session. That was fine while the only thing that
 * ever built a briefing was a person sitting in front of the app.
 *
 * The paper is written on a schedule now, by a job with no session, and it
 * has to send the model the *same* briefing — a second copy of this prose
 * would drift from the first within a week and the two would quietly start
 * asking for different things.
 *
 * So the pure assembly lives here, importable from either side, and the two
 * callers differ only in how they fetch. Nothing in this file touches a
 * database or a session.
 */

/**
 * HOW FAR BACK THE SHARED MEMORY REACHES — AND WHY IT IS NOT FOUR DAYS.
 *
 * This was four days, set when the paper came out every morning. The paper
 * became WEEKLY and this number did not move, so the arithmetic quietly
 * inverted: every issue is seven days after the last one, four is less than
 * seven, and therefore the "do not repeat yourself" list was EMPTY EVERY
 * SINGLE WEEK. The model was never told what it had already published. It was
 * not ignoring the rule; it was never shown the list the rule refers to.
 *
 * The visible symptom was one article leading the paper three weeks running.
 * The invisible one is worse: the scout was also re-searching ground it had
 * already stripped, so the *whole* issue was being rebuilt out of a shrinking
 * pool of the same pages.
 *
 * So the window is expressed in ISSUES now, not days, and it is long. Ten
 * weeks is long enough that a story cannot come back around while the seller
 * still remembers reading it, and the cap is raised to match — five items plus
 * extras per issue means fourteen headlines was barely two weeks of paper even
 * when the window was wide enough to ask for more.
 */
export const SIGNAL_WEEKS = 10;
export const SIGNAL_DAYS = SIGNAL_WEEKS * 7;
export const SIGNAL_MAX = 90;
export const DROP_HISTORY = 4;

export interface Signal {
  issue_date: string;
  kind: string;
  headline: string;
  sources?: { title?: string; url?: string }[] | null;
}

export function dropStory(world: World, drops: Drop[], current?: Drop | null) {
  const lines: string[] = [];
  const frozen = drops.filter((d) => d.frozenAt).slice(0, DROP_HISTORY);

  if (current)
    lines.push(
      `[drop_record] Current board: DROP ${String(current.number).padStart(2, "0")}, publishing ${formatDropDate(current.publishDate)}, ${current.items.length} of ${world.slotsPerDrop} slots filled.`,
    );

  if (frozen.length)
    lines.push(
      `[drop_record] Released so far: ${frozen
        .map(
          (d) =>
            `DROP ${String(d.number).padStart(2, "0")} (${formatDropDate(d.publishDate)}, ${d.items.length} designs)`,
        )
        .join(" · ")}.`,
    );

  return lines;
}

/**
 * WHERE EVERYTHING CAME FROM
 *
 * Every room shares one memory, which means every room is one careless
 * sentence away from turning a saved design reference into proof that
 * something sells, or a simulated customer into a market. The tags below
 * travel with the context so the model can tell evidence from inspiration
 * without having to guess, and the rules are stated once rather than
 * re-litigated in five different system prompts.
 */
export const SOURCE_KEY = `HOW TO WEIGH WHAT FOLLOWS
Each line is tagged with where it came from. These tags are the difference between evidence and inspiration, and you must never quietly upgrade one into the other.
- [seller_validated_keyword] a search term the seller checked in eRank. Real demand evidence for that exact phrase and nothing more. It says nothing about designs, styles, or what will sell.
- [world_signal] something a live web search verified as real and current in this world. True, but not demand data and not a product instruction.
- [research_board_item] something the seller collected while researching. Raw material they happened to notice. Unverified.
- [customer_simulation] words from the simulated customer. One plausible person, extrapolated from research. Never evidence about a market.
- [drop_record] what has been uploaded and released. A record of what was made. No sales or performance figures exist anywhere in this software, so never imply you can see how anything did.`;

/**
 * The opening of any briefing: who this world is, and what it has already
 * said. Shared by every room; the rooms add their own sections after it.
 */
export function worldOpening(world: World): string[] {
  const lines: string[] = [
    SOURCE_KEY,
    "",
    `THE WORLD: ${world.name}`,
    `[seller_validated_keyword] ${world.subNiches.map((s) => s.keyword).join(" · ") || "none recorded"}.`,
    `Parts of this world being watched: ${world.areas.map((a) => a.name).join(" · ") || "none yet"}.`,
  ];

  /*
    The reference images used to contribute a line here saying how many there
    were. A count is not a signal — no model can do anything with "there are
    eight pictures" — so it was tokens on every expensive call in exchange for
    nothing. If these should ever really inform the work, the images have to
    be sent and read, which is a different feature.
  */

  return lines;
}

/** What the paper has already printed, so this week's does not repeat it. */
/**
 * EVERY PAGE THIS WORLD HAS ALREADY BEEN SHOWN.
 *
 * A headline can be rephrased and a rephrased headline slips a repeat past any
 * instruction, however firmly worded. A URL cannot be rephrased. This is the
 * half of the no-repeat rule that is mechanical rather than persuasive: the
 * route drops any item citing a page in here, before the seller sees it, with
 * no argument available to the model.
 */
export function coveredUrls(signals: Signal[], extras: string[] = []): string[] {
  const out = new Set<string>();
  for (const s of signals)
    for (const src of s.sources ?? []) if (src?.url) out.add(src.url);
  /*
    THE EXTRAS ARE PAGES TOO.

    "More this week" is printed on the page under the same masthead, and after
    it stopped being a collapsed toggle it became some of the most-read
    material in the issue. It was still invisible to the no-repeat rule, which
    only ever looked at wb_daily_items — so an extra could recur verbatim every
    week forever, and a story that ran as an extra could come back next week as
    the lead with nothing to stop it.
  */
  for (const u of extras) if (u) out.add(u);
  return [...out];
}

export function alreadyReported(
  signals: Signal[],
  room: "daily" | "other",
  extras: string[] = [],
) {
  if (!signals.length && !extras.length) return [];
  if (room !== "daily")
    return [
      "",
      `RECENTLY IN THIS WORLD'S DAILY PAPER — real things the seller has been reading about. You can refer to them naturally.`,
      ...signals.map((s) => `- [world_signal] [${s.issue_date}] ${s.headline}`),
    ];

  const pages = coveredUrls(signals, extras);

  return [
    "",
    `GROUND THIS PAPER HAS ALREADY COVERED — the last ${SIGNAL_WEEKS} weeks of issues.`,
    "",
    `THIS IS AN INSTRUCTION ABOUT WHERE TO LOOK, NOT A FILTER TO APPLY AT THE END. Do not search the same ground and then discard what comes back — that leaves you choosing between a repeat and the dregs of a search you should not have run. Search SOMEWHERE ELSE. There is no shortage of internet: a different corner of this world, a different community inside it, a different week of it, the argument next door to the one already covered. Come back with new material, not with leftovers.`,
    "",
    `Nothing below may be reported again, in any wording. A near-duplicate, a follow-up to the same event, or the same story told from a second outlet all count as the same story.`,
    ...signals.map((s) => `- [world_signal] [${s.issue_date}] ${s.headline}`),
    ...(pages.length
      ? [
          "",
          `PAGES ALREADY CITED TO THIS SELLER. Citing any of these will drop the item, so do not build one on them:`,
          ...pages.slice(0, 60).map((u) => `- ${u}`),
        ]
      : []),
  ];
}

/**
 * The whole briefing for the paper. This is the one room whose context needs
 * no conversation history and no board, which is exactly why it is the one
 * that can be built by a scheduled job.
 */
export function dailyContext(
  world: World,
  drops: Drop[],
  signals: Signal[],
  /** URLs of the "More this week" extras from those same issues. */
  extras: string[] = [],
): string {
  return [
    ...worldOpening(world),
    ...dropStory(world, drops, null),
    ...alreadyReported(signals, "daily", extras),
  ].join("\n");
}
