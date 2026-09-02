import Anthropic from "@anthropic-ai/sdk";

/**
 * SORTING A SHOP AGAINST THE WORLD BEING BUILT.
 *
 * Shops on Etsy are almost never one world. A shop that sells feminist work
 * also sells library totes, teacher gifts and dog mugs, and the read had no
 * way to tell which was which — it sampled by favorite rate across the whole
 * catalogue, so whichever corner performed best won, and the brief came back
 * about that corner. On angiepea the books and libraries work favorites at
 * 23.5% against 18.4% for the feminist work, so libraries won and the seller
 * got a brief about libraries.
 *
 * THREE BUCKETS, AND THE MIDDLE ONE IS THE POINT.
 *
 *   core   directly in the world being built
 *   near   next door — the same customer, a neighbouring cause
 *   other  genuinely unrelated
 *
 * Two buckets would be easy and wrong. A feminist world's customer also buys
 * LGBTQ rights and protest work; cutting to "feminist only" throws away the
 * most useful adjacent material in the shop. "Other" is reserved for things
 * that share a shop and nothing else.
 *
 * Titles and tags only — no pictures. That is what makes it affordable to run
 * across five hundred listings, and it is enough: a title on Etsy is written
 * to be searched, so it says what a design is about even when it says nothing
 * about how it looks.
 */

const SORTER = process.env.WB_SCOUT || "claude-haiku-4-5-20251001";

/** Sorted in batches so one enormous shop cannot blow the context. */
const BATCH = 120;

const SYSTEM = `You are sorting one Etsy shop's listings by how they relate to a particular world a seller is building.

You will be given the world, then a numbered list of listing titles with their tags. For every number, answer with one word.

core — the design is directly about this world. Its subject is the thing the world is about.

near — not the world itself, but the same customer and a neighbouring cause. Somebody who buys the core work would plausibly buy this. Sibling causes, adjacent politics, the same scene or subculture, the same stance pointed at a different target.

other — unrelated to this world. It shares a shop and nothing else. A different customer, or a generic product with no connection to the world.

THE MISTAKE THAT MATTERS MOST
Being too strict. "near" exists so that useful adjacent material survives, and a seller researching a world wants to see the neighbourhood, not only the exact centre. If you can tell a real story about why the same person would buy it, that is near, not other.

Be strict only in the opposite direction: a design about a genuinely different subject, bought by a genuinely different person, is other however worthy it is.

WORKED EXAMPLE — world: feminism and advocacy
"Bans Off Our Bodies Shirt"           core   — the subject IS the world
"Protect Trans Kids Tee"              near   — different cause, same customer and same stance
"Vote Like Your Rights Depend On It"  near   — general advocacy, same person
"Support Your Local Library Tote"     other  — worthy, and a different customer entirely
"Golden Retriever Mom Mug"            other

Answer with one line per listing, exactly: the number, a colon, and one of core / near / other. Nothing else. Every number gets a line.`;

export interface Sortable {
  listing_id: number | string;
  title: string;
  tags?: string[] | null;
}

export type Bucket = "core" | "near" | "other";

/**
 * A short description of the world, used both to sort and to decide whether
 * an existing sort is still valid. Keep it stable — the signature is derived
 * from this, so churn here means needless re-sorting.
 */
export function worldSignature(
  name: string,
  keywords: string[],
  areas: string[],
): string {
  return [
    name.trim(),
    [...keywords].map((k) => k.trim().toLowerCase()).sort().join("|"),
    [...areas].map((a) => a.trim().toLowerCase()).sort().join("|"),
  ].join("::");
}

export function worldBrief(
  name: string,
  keywords: string[],
  areas: string[],
): string {
  return [
    `THE WORLD: ${name || "unnamed"}`,
    keywords.length
      ? `Search terms the seller has validated: ${keywords.join(" · ")}`
      : "",
    areas.length ? `Parts of the world they watch: ${areas.join(" · ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Sort every listing. Returns a map of listing id to bucket.
 *
 * Anything the model does not answer for is left out rather than guessed at,
 * and the caller treats an unsorted design as "near" — the forgiving side,
 * because a sorting failure should not quietly hide a shop's best work.
 */
export async function sortAgainstWorld(
  client: Anthropic,
  designs: Sortable[],
  brief: string,
  onUsage?: (u: Anthropic.Usage, model: string, ms: number) => void,
): Promise<Map<string, Bucket>> {
  const out = new Map<string, Bucket>();

  for (let at = 0; at < designs.length; at += BATCH) {
    const batch = designs.slice(at, at + BATCH);
    const listed = batch
      .map((d, i) => {
        const tags = (d.tags ?? []).slice(0, 8).join(", ");
        return `${i + 1}. ${d.title}${tags ? ` [tags: ${tags}]` : ""}`;
      })
      .join("\n");

    const began = Date.now();
    const res = await client.messages.create({
      model: SORTER,
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: `${brief}\n\nLISTINGS\n${listed}` }],
    });
    onUsage?.(res.usage, SORTER, Date.now() - began);

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n");

    for (const line of text.split("\n")) {
      const m = /^\s*(\d+)\s*[:.\-]\s*(core|near|other)\b/i.exec(line);
      if (!m) continue;
      const d = batch[Number(m[1]) - 1];
      if (d) out.set(String(d.listing_id), m[2].toLowerCase() as Bucket);
    }
  }

  return out;
}
