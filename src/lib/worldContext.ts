import { AFFINITY_QUESTIONS, type World } from "./world";
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

/** How far back the shared memory reaches. */
export const SIGNAL_DAYS = 4;
export const SIGNAL_MAX = 14;
export const DROP_HISTORY = 4;

export interface Signal {
  issue_date: string;
  kind: string;
  headline: string;
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

/** How the seller says they relate to this customer. Reflection, not a score. */
export function connection(world: World) {
  const answered = AFFINITY_QUESTIONS.filter(
    (q) => world.affinity[q.key] !== null,
  );
  if (!answered.length) return [];
  return [
    `[seller_reflection] How strongly the seller says they relate to this customer, on a 1–10 scale they answered in words: ${answered
      .map((q) => `${q.question} ${world.affinity[q.key]}`)
      .join(" · ")}.`,
  ];
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
- [visual_calibration_reference] a design the seller saved because they like its style. Taste, not demand. Never proof anything sells, and never described closely enough that it could be remade.
- [world_signal] something a live web search verified as real and current in this world. True, but not demand data and not a product instruction.
- [research_board_item] something the seller collected while researching. Raw material they happened to notice. Unverified.
- [customer_simulation] words from the simulated customer. One plausible person, extrapolated from research. Never evidence about a market.
- [seller_reflection] the seller's private answers about their own connection to this world. Never quote it back and never treat it as a verdict.
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

  if (world.visualReferences.length)
    lines.push(
      `[visual_calibration_reference] ${world.visualReferences.length} designs on file showing the creative style the seller likes.`,
    );

  return lines;
}

/** What the paper has already printed, so this week's does not repeat it. */
export function alreadyReported(signals: Signal[], room: "daily" | "other") {
  if (!signals.length) return [];
  return [
    "",
    room === "daily"
      ? `ALREADY REPORTED IN THE LAST ${SIGNAL_DAYS} DAYS — do not report any of these again, and do not report a near-duplicate. Find something new, or return fewer items.`
      : `RECENTLY IN THIS WORLD'S DAILY PAPER — real things the seller has been reading about. You can refer to them naturally.`,
    ...signals.map((s) => `- [world_signal] [${s.issue_date}] ${s.headline}`),
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
): string {
  return [
    ...worldOpening(world),
    ...connection(world),
    ...dropStory(world, drops, null),
    ...alreadyReported(signals, "daily"),
  ].join("\n");
}
