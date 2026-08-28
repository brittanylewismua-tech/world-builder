import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, endWell, meter, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { etsyKey, reviewsFor } from "@/lib/etsy";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * READING A SHOP THAT ALREADY BUILT THIS WORLD.
 *
 * Two reads, deliberately kept apart, because they rest on different
 * evidence. One looks at the designs; the other listens to the people who
 * bought them. Mixing them would let a strong quote stand in for a pattern
 * and a pattern stand in for a quote.
 *
 * THE CATALOGUE READ works in two layers, because a three hundred listing
 * shop cannot be looked at in full — three hundred photographs is over a
 * dollar. So: every title and tag goes in as text, which costs nothing and
 * covers the whole shop, and then the forty designs people actually saved get
 * looked at properly. Breadth from words, depth from pictures.
 *
 * THE BUYER READ joins each review to the design it was written about, which
 * is the thing no shop page shows you. Roughly half of any shop's reviews say
 * something beyond "great quality" and about a fifth name a person or an
 * occasion, so the filtering happens before the model sees them.
 */

/** How many designs get looked at rather than merely listed. */
const LOOK_AT = 24;

/** Below this, a save rate is noise — one viewer and one save is 100%. */
const ENOUGH_VIEWS = 150;

const CATALOGUE_SYSTEM = `You are looking at a print-on-demand shop that already sells to the customer another seller is trying to build a world around. Say what this shop is doing.

WHAT YOU HAVE
Every design in the shop as a title, with its tags and Etsy's own view and save counts. Then the artwork itself for the forty designs the highest share of viewers saved — the ones people actually wanted, as opposed to the ones search happened to deliver.

Views and saves here are measured by Etsy, not estimated. Treat the save rate as the honest signal of whether a design landed, and views as how much traffic it got. Those are different things and a shop's biggest traffic-getter is often not its most loved design.

WHAT THE JOB IS, AND WHAT IT IS NOT
Report what this shop does. It is not your job to suggest designs, name gaps, or say what is missing from their catalogue — a shop's absences are just what they chose not to sell. If you catch yourself writing "nobody has done" or "there is room for", stop.

WHAT TO WRITE
Five to seven things about this shop, strongest first. Between them they should answer:
- What this shop keeps doing. The move underneath the designs, not the words.
- What their most-saved designs share that the rest of the catalogue does not. This is the most useful thing you can find, so work at it.
- Whether they have one idea worked many ways or genuinely range, and roughly how it splits.
- Anything the numbers say plainly — a design pulling enormous traffic and few saves, a quiet one people love, a price that never moves.

WRITE LIKE A PERSON, NOT A CRITIC
Short, ordinary words. If it would look strange in a text message to a friend, do not use it. Banned: tableau, motif, device, mechanic, iconography, canon, lineage, juxtapose, subvert, interrogate, recontextualise, visual language, semiotic.

BACK IT UP
Quote the titles. Give the numbers. "Their top-viewed sticker pulled 33,893 views and 18% saved it, while the Medusa one pulled 3,646 and 47% saved it" is a finding. "They have strong designs" is a horoscope.

NEVER
- Never suggest a design, an idea or a subject to try.
- Never write about fabric, print quality, shipping or mockups.
- Never say the sample was small or that more data would help.
- Never hedge. Say the thing.`;

const BUYER_SYSTEM = `You are reading what buyers wrote about the designs they bought from one print-on-demand shop, and telling another seller who this customer is.

WHAT YOU HAVE
Reviews, each attached to the design it was written about. They have already been filtered to the ones that say something — most reviews on any shop are "great quality, fast shipping" and those are gone.

WHAT TO LOOK FOR
Who these people are and why they bought. Who it was for. What occasion. What they say the design did — made someone laugh, said the thing they could not say, got noticed. Where the same kind of person or the same occasion keeps coming back, that is the finding.

WHAT THE JOB IS, AND WHAT IT IS NOT
Report what buyers said. Never suggest a design or a subject. Never write about shipping, packaging or print quality, however often they mention it — that is not who the customer is.

WHAT TO WRITE
Four to six findings, strongest first. Every one carries a real quote, copied exactly from a review, and names the design it was about where that matters.

WRITE LIKE A PERSON
Short, ordinary words. No jargon. Let the buyers do the talking — your sentence says what the pattern is, the quote proves it.

NEVER
- Never invent or paraphrase a quote. Copy it.
- Never build a finding on one review unless the quote is extraordinary, and say so if you do.
- Never hedge.`;

const TOOL = {
  name: "write_brief",
  description: "What this shop is doing.",
  input_schema: {
    type: "object",
    properties: {
      patterns: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
            /* Only the buyer read fills this: the words somebody wrote. */
            quote: { type: "string" },
          },
          required: ["heading", "body"],
        },
      },
    },
    required: ["patterns"],
  },
} as const;

interface Design {
  listing_id: number;
  title: string;
  image_url: string | null;
  views: number;
  favorers: number;
  price: number | null;
  tags: string[] | null;
}

/** The share of people who saw it and saved it. The one honest measure of
 *  whether a design landed, separate from how much traffic it got. */
function saveRate(d: Design) {
  return d.views >= ENOUGH_VIEWS ? d.favorers / d.views : 0;
}

function smaller(url: string) {
  return url.replace(/il_(fullxfull|\d+x[N\d]+)\./i, "il_570xN.");
}

export async function POST(req: Request) {
  let body: { worldId?: string; shopId?: string; kind?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const { worldId, shopId } = body;
  const kind = body.kind === "buyers" ? "buyers" : "patterns";
  if (!worldId || !shopId)
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  const gate = await admit(req, "shops");
  if ("deny" in gate) return gate.deny;

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );

  const db = serviceDb();
  const { data: shop } = await db
    .from("wb_shops")
    .select("id, etsy_shop_id, shop_name, listing_count, sold_count, review_count")
    .eq("id", shopId)
    .eq("world_id", worldId)
    .maybeSingle();

  if (!shop)
    return NextResponse.json({ error: "No such shop." }, { status: 404 });

  const { data: designRows } = await db
    .from("wb_shop_designs")
    .select("listing_id, title, image_url, views, favorers, price, tags")
    .eq("shop_id", shopId);

  const designs = (designRows ?? []) as Design[];
  if (designs.length < 5)
    return NextResponse.json(
      { error: "There is not enough of this shop to read." },
      { status: 400 },
    );

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const started = Date.now();
  const content: Anthropic.ContentBlockParam[] = [];

  if (kind === "patterns") {
    /*
      Layer one: the whole catalogue as text. Free, and on a shop like this
      the title is very nearly the design — "The Horrors Persist but So Do I
      Possum" needs no picture to be understood.
    */
    const ranked = [...designs].sort((a, b) => saveRate(b) - saveRate(a));
    const lines = [...designs]
      .sort((a, b) => b.favorers - a.favorers)
      .map(
        (d) =>
          `${d.title} — ${d.views.toLocaleString()} views, ${d.favorers.toLocaleString()} saved${
            d.views >= ENOUGH_VIEWS
              ? ` (${(100 * saveRate(d)).toFixed(0)}%)`
              : ""
          }${d.price != null ? `, $${d.price.toFixed(2)}` : ""}`,
      );

    content.push({
      type: "text",
      text: `SHOP: ${shop.shop_name} — ${shop.listing_count ?? designs.length} active listings${
        shop.sold_count ? `, ${shop.sold_count.toLocaleString()} sales all time` : ""
      }\n\nTHE WHOLE CATALOGUE\n${lines.join("\n")}`,
    });

    /*
      Layer two: the ones people actually saved, looked at properly.

      Only Etsy's own image host. Anthropic fetches these URLs itself, so one
      address that does not resolve to an image fails the entire call — and a
      whole read dying because of a single stale picture is not a trade worth
      making.
    */
    const looked = ranked
      .filter((d) => d.image_url && /^https:\/\/i\.etsystatic\.com\//.test(d.image_url))
      .slice(0, LOOK_AT);
    content.push({
      type: "text",
      text: `\nTHE ${looked.length} DESIGNS THE HIGHEST SHARE OF VIEWERS SAVED — the artwork follows, best rate first.`,
    });
    for (const d of looked) {
      content.push({
        type: "text",
        text: `${d.title} — ${(100 * saveRate(d)).toFixed(0)}% of ${d.views.toLocaleString()} viewers saved it`,
      });
      content.push({
        type: "image",
        source: { type: "url", url: smaller(d.image_url as string) },
      } as Anthropic.ImageBlockParam);
    }
    content.push({
      type: "text",
      text: "Write the brief. Look at the artwork, not the products it is printed on.",
    });
  } else {
    const key = etsyKey();
    if (!key)
      return NextResponse.json(
        { error: "This deployment has no Etsy key." },
        { status: 503 },
      );

    let reviews;
    try {
      reviews = await reviewsFor(shop.etsy_shop_id as number, key, 400);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Etsy did not answer." },
        { status: 502 },
      );
    }

    /*
      Most reviews are "love it, thanks". Sixty characters is a crude line but
      it is the right one: below it almost nothing carries a person, an
      occasion or a reason, and the model's attention is better spent on the
      half that does.
    */
    const byListing = new Map(designs.map((d) => [d.listing_id, d.title]));
    const useful = reviews
      .map((r) => ({
        text: (r.review ?? "").trim(),
        title: r.listing_id ? byListing.get(r.listing_id) : undefined,
      }))
      .filter((r) => r.text.length >= 60)
      .slice(0, 160);

    if (useful.length < 8)
      return NextResponse.json(
        {
          error:
            "This shop's reviews are almost all one-liners. There is nothing here to read.",
        },
        { status: 400 },
      );

    content.push({
      type: "text",
      text: `SHOP: ${shop.shop_name}\n\n${useful.length} reviews that say something, each with the design it was written about.\n\n${useful
        .map(
          (r) =>
            `${r.title ? `[on "${r.title.slice(0, 70)}"] ` : ""}${r.text.slice(0, 400)}`,
        )
        .join("\n\n")}`,
    });
    content.push({
      type: "text",
      text: "Write the brief. Who are these people and why did they buy.",
    });
  }

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: [
        {
          type: "text",
          text: kind === "patterns" ? CATALOGUE_SYSTEM : BUYER_SYSTEM,
          cache_control: { type: "ephemeral", ttl: "1h" },
        } as unknown as Anthropic.TextBlockParam,
      ],
      tools: [TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "write_brief" },
      messages: [{ role: "user", content }],
    });

    meter("shops", door.userId, {
      model: MODEL,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
      cache_read_input_tokens: res.usage.cache_read_input_tokens,
      cache_creation_input_tokens: res.usage.cache_creation_input_tokens,
      ms: Date.now() - started,
      worldId,
    });

    const call = res.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use")
      return NextResponse.json(
        { error: "That did not come back with anything. Try it again." },
        { status: 502 },
      );

    const raw = call.input as { patterns?: Record<string, string>[] };
    const patterns = (raw.patterns ?? [])
      .filter((p) => p?.heading && p?.body)
      .map((p) => ({
        heading: String(p.heading).trim(),
        body: endWell(String(p.body).trim(), res.stop_reason),
        quote: p.quote ? String(p.quote).trim() : undefined,
      }));

    if (!patterns.length)
      return NextResponse.json(
        { error: "That did not come back with anything. Try it again." },
        { status: 502 },
      );

    const brief = { patterns };
    await db.from("wb_shop_reads").insert({
      world_id: worldId,
      shop_id: shopId,
      kind,
      brief,
      counted: kind === "patterns" ? designs.length : patterns.length,
    });

    return NextResponse.json({ brief, kind });
  } catch (e) {
    /*
      Say what actually went wrong. "That did not finish" is honest and
      useless: it hides whether Etsy refused, an image would not load, or the
      request was too big, and every one of those wants a different fix.
    */
    const why = e instanceof Error ? e.message : "";
    console.error("shops/read", e);
    return NextResponse.json(
      {
        error: why
          ? `That did not finish — ${why.slice(0, 200)}`
          : "That did not finish. Try it again.",
      },
      { status: 500 },
    );
  }
}
