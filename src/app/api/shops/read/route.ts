import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, endWell, meter, ownerOf, refund } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { etsyKey, reviewsFor } from "@/lib/etsy";
import { ENOUGH_VIEWS } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * The buyer read is pulling who-and-why out of a hundred and sixty short
 * reviews. That is extraction, not judgement, and it has no pictures in it —
 * the small model does it just as well for about a twelfth of the price.
 * Looking at artwork stays on the big one.
 */
const TEXT_MODEL = process.env.WB_SCOUT || "claude-haiku-4-5-20251001";

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
const LOOK_AT = 16;

/*
  Etsy serves a fixed set of widths and the choice is a straight trade of
  pennies against legibility. The hits carry words on them and have to be
  readable, so they come at 570. The spread sample only has to answer "does
  the rest of the shop look like the hits", which a 300 pixel thumbnail
  settles at a third of the tokens.
*/
const BIG = "il_570xN.";
const SMALL = "il_300x300.";

/** Below this, a favorite rate is noise — one viewer and one save is 100%. */

const CATALOGUE_SYSTEM = `You are looking at a print-on-demand shop that already sells to the customer another seller is trying to build a world around. Say what this shop is doing.

WHAT YOU HAVE
Every design in the shop as a title, with its tags and Etsy's own view and favorite counts. Then the artwork itself for the forty designs the highest share of viewers favorited — the ones people actually wanted, as opposed to the ones search happened to deliver.

Views and favorites here are measured by Etsy, not estimated. Treat the favorite rate as the honest signal of whether a design landed, and views as how much traffic it got. Those are different things and a shop's biggest traffic-getter is often not its most loved design.

WHAT THE JOB IS, AND WHAT IT IS NOT
Report what this shop does. It is not your job to suggest designs, name gaps, or say what is missing from their catalogue — a shop's absences are just what they chose not to sell. If you catch yourself writing "nobody has done" or "there is room for", stop.

WHAT TO WRITE
Five to seven things about this shop, strongest first. Between them they should answer:
- What this shop keeps doing. The move underneath the designs, not the words.
- What their most-favorited designs share that the rest of the catalogue does not. This is the most useful thing you can find, so work at it.
- Whether they have one idea worked many ways or genuinely range, and roughly how it splits.
- Anything the numbers say plainly — a design pulling enormous traffic and few saves, a quiet one people love, a price that never moves.

HOW EACH FINDING IS SHAPED
Three parts, and keeping them apart is what makes this readable:
- heading: the finding in a handful of plain words.
- body: ONE short sentence saying what it is. Not a paragraph. If you are writing a third clause, it belongs in the lines below.
- points: two to four short lines, one fact each — a number, a title, a thing you saw. Wrap the words that carry each line in **double asterisks**: "**18% favorited it** against 47% on the Medusa one".

Do not repeat the heading in the body, and do not repeat the body in the points.

WRITE LIKE A PERSON, NOT A CRITIC
Short, ordinary words. If it would look strange in a text message to a friend, do not use it. Banned: tableau, motif, device, mechanic, iconography, canon, lineage, juxtapose, subvert, interrogate, recontextualise, visual language, semiotic.

BACK IT UP
Quote the titles. Give the numbers. "Their top-viewed sticker pulled 33,893 views and 18% favorited it, while the Medusa one pulled 3,646 and 47% favorited it" is a finding. "They have strong designs" is a horoscope.

USE ETSY'S WORDS, NOT YOURS
A favorite is what Etsy calls it when somebody taps the heart. Say favorites and favorited. Never "saves" or "saved" — that is not a word the seller sees anywhere in their shop.

Say the numbers the way a seller reads them: "293,297 views and 3% of them favorited it". No ratios, no percentages of percentages, no jargon.

IGNORE THE SHOP'S FILING
Titles are full of the seller's own internal codes — G1, G2, G8, GOOSE, colour abbreviations, SKU fragments. They mean something inside that shop and nothing to anybody else. Never quote them, never treat them as a pattern, and never build a finding on them. Describe what the design IS.

SHOW YOUR WORK
Every design you are shown arrives with its id in square brackets, like [4374285986]. When a finding is about how something looks, put the ids of one to three of those designs in "examples" and the seller will see the actual artwork beside your words. Only ids you were shown a picture of — never one you only saw a title for.

DO NOT OVERCLAIM. THIS IS THE EASIEST WAY TO BE WRONG.
You are shown the artwork for a couple of dozen designs out of hundreds, and most of those are the shop's hits. You have titles for the rest and titles do not tell you what a picture looks like.

So: never write "every", "all", "always", "the whole shop" or "exclusively" about the catalogue unless the TITLES support it for every listing. Say "most of their most-favorited", "the bulk of the catalogue", "eight of the twenty-four I looked at" — count, and be honest about which set you counted.

Bad: "Every single line is a small embroidered chest icon on a sweatshirt."
Good: "Their most-favorited designs are almost all small embroidered chest icons, though the catalogue also runs to tumblers and blankets."

If the hits and the ordinary listings disagree, that disagreement is one of your findings, not something to smooth over.

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

HOW EACH FINDING IS SHAPED
Three parts, and keeping them apart is what makes this readable:
- heading: the finding in a handful of plain words.
- body: ONE short sentence saying what it is. Not a paragraph. If you are writing a third clause, it belongs in the lines below.
- points: two to four short lines, one fact each — how often it came up, which design, what kind of buyer. Wrap the words that carry each line in **double asterisks**: "**18% favorited it** against 47% on the Medusa one".

Do not repeat the heading in the body, and do not repeat the body in the points.

SHOW THE DESIGN
Each review arrives with the listing id of what it was written about, in square brackets. Put those ids in "examples" and the seller sees the artwork beside the words. Only ids you were actually given.

USE ETSY'S WORDS
A favorite is what Etsy calls it when somebody taps the heart. Never say "saves". And never quote a shop's internal variant codes — G1, G8, colour abbreviations — they are that seller's filing and mean nothing to anybody else.

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
            body: {
              type: "string",
              description:
                "ONE short sentence saying what the finding is. Not a paragraph.",
            },
            /*
              The evidence, split up. A finding used to arrive as one block of
              prose carrying the claim and four supporting facts at once,
              which is accurate and unreadable. The claim goes in body; each
              thing that backs it up gets its own line here.
            */
            points: {
              type: "array",
              description:
                "Two to four short lines of evidence, each one fact. Wrap the words that carry it in **double asterisks**.",
              items: { type: "string" },
            },
            /*
              A finding about pictures should be able to show one. Every image
              arrives labelled with its listing id in square brackets; naming
              them here puts the actual artwork under the words.
            */
            examples: {
              type: "array",
              description:
                "The listing ids, as numbers, of one to three designs shown to you that demonstrate this finding. Only ids you were actually shown a picture of.",
              items: { type: "number" },
            },
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

/**
 * WHATEVER SHAPE IT CAME BACK IN.
 *
 * A tool schema asks for an array of objects. What actually arrives varies,
 * and each variant breaks a different way:
 *
 *   - the array, as asked
 *   - a JSON STRING containing the whole answer, sometimes nested as
 *     {"patterns": "{\"patterns\": [ ... ]}"}
 *   - a single finding as a bare object
 *   - the list as an object keyed "0", "1", "2"
 *
 * The string case is the nasty one: Object.values on a string returns its
 * characters, so a perfectly good brief silently becomes two thousand
 * one-letter entries, every one of which fails validation, and the seller is
 * told nothing came back — after paying for a read that worked.
 *
 * So: parse strings, unwrap a nested key of the same name, and only then
 * treat it as a list. Never call Object.values on a string.
 */
function asPoints(v: unknown, key = "patterns"): Record<string, unknown>[] {
  let seen = v;

  for (let round = 0; round < 3; round++) {
    if (typeof seen === "string") {
      const text = seen.trim();
      if (!text.startsWith("{") && !text.startsWith("[")) return [];
      try {
        seen = JSON.parse(text);
      } catch {
        return [];
      }
      continue;
    }
    if (
      seen &&
      typeof seen === "object" &&
      !Array.isArray(seen) &&
      key in (seen as Record<string, unknown>)
    ) {
      seen = (seen as Record<string, unknown>)[key];
      continue;
    }
    break;
  }

  if (Array.isArray(seen)) return seen as Record<string, unknown>[];
  if (seen && typeof seen === "object")
    return Object.values(seen as object) as Record<string, unknown>[];
  return [];
}

interface Design {
  listing_id: number;
  title: string;
  image_url: string | null;
  views: number;
  favorers: number;
  price: number | null;
  tags: string[] | null;
}

/** The share of people who saw it and favorited it. The one honest measure of
 *  whether a design landed, separate from how much traffic it got. */
function saveRate(d: Design) {
  return d.views >= ENOUGH_VIEWS ? d.favorers / d.views : 0;
}

function sized(url: string, size: string) {
  return url.replace(/il_(fullxfull|\d+x[N\d]+)\./i, size);
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

  const db = serviceDb();

  /*
    ONE READ OF ONE SHOP PER WEEK.

    The weekly allowance above is a ceiling on the account. This is the guard
    that matters day to day, because the easiest way to spend real money here
    for nothing is pressing Read again twice in a row on the same shop — the
    catalogue has not moved, so the second brief costs the same and says the
    same thing.

    Deliberately checked BEFORE admit, which spends a unit as it runs: being
    told to come back next week must not itself cost a read.
  */
  const { data: before } = await db
    .from("wb_shop_reads")
    .select("ran_at")
    .eq("shop_id", shopId)
    .eq("kind", kind)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (before?.ran_at) {
    const opens = new Date(before.ran_at as string);
    opens.setDate(opens.getDate() + 7);
    if (Date.now() < opens.getTime()) {
      const day = (d: Date) =>
        d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
      return NextResponse.json(
        {
          error: `You read this shop on ${day(
            new Date(before.ran_at as string),
          )}. You can read it again on ${day(
            opens,
          )} — a shop's catalogue does not change much inside a week, and the read you have is still on the page.`,
        },
        { status: 429 },
      );
    }
  }

  const gate = await admit(req, "shops");
  if ("deny" in gate) return gate.deny;

  /*
    Nothing is charged for work that did not happen. The unit is reserved
    before the call so the check can be atomic; every exit that hands back
    no result returns it.
  */
  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(gate.caller, "shops");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  const { data: shop } = await db
    .from("wb_shops")
    .select("id, etsy_shop_id, shop_name, listing_count, sold_count, review_count")
    .eq("id", shopId)
    .eq("world_id", worldId)
    .maybeSingle();

  if (!shop) {
    await settle();
    return NextResponse.json({ error: "No such shop." }, { status: 404 });
  }

  const { data: designRows } = await db
    .from("wb_shop_designs")
    .select("listing_id, title, image_url, views, favorers, price, tags")
    .eq("shop_id", shopId);

  const designs = (designRows ?? []) as Design[];
  if (designs.length < 5) {
    await settle();
    return NextResponse.json(
      { error: "There is not enough of this shop to read." },
      { status: 400 },
    );
  }

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
    /*
      The whole catalogue as text is thirteen thousand tokens on a big shop,
      and the tail of it is listings nobody has ever seen. Two hundred covers
      everything with any traffic on it; the rest is counted rather than
      listed, which is honest and four cents cheaper.
    */
    const ordered = [...designs].sort((a, b) => b.favorers - a.favorers);
    const lines = ordered
      .slice(0, 200)
      .map(
        (d) =>
          `${d.title} — ${d.views.toLocaleString()} views, ${d.favorers.toLocaleString()} favorited${
            d.views >= ENOUGH_VIEWS
              ? ` (${(100 * saveRate(d)).toFixed(0)}%)`
              : ""
          }${d.price != null ? `, $${d.price.toFixed(2)}` : ""}`,
      );

    content.push({
      type: "text",
      text: `SHOP: ${shop.shop_name} — ${shop.listing_count ?? designs.length} active listings${
        shop.sold_count ? `, ${shop.sold_count.toLocaleString()} sales all time` : ""
      }\n\nTHE CATALOGUE${
        ordered.length > 200
          ? ` — the ${lines.length} with the most favorites, out of ${ordered.length}. The other ${ordered.length - 200} have almost no traffic between them.`
          : ""
      }\n${lines.join("\n")}`,
    });

    /*
      Layer two: the ones people actually saved, looked at properly.

      Only Etsy's own image host. Anthropic fetches these URLs itself, so one
      address that does not resolve to an image fails the entire call — and a
      whole read dying because of a single stale picture is not a trade worth
      making.
    */
    /*
      TWO KINDS OF SAMPLE, BECAUSE ONE OF THEM LIES.

      Showing only the most-favorited designs and asking what the shop does
      produced "every single line is a small embroidered chest icon" about a
      catalogue where that was not true. Of course it did: it had seen the
      twenty-four most-loved and nothing else, and the most-loved of any shop
      look alike.

      So two thirds are the most-favorited and one third is an even walk through
      the whole catalogue, and the prompt is told which is which. The first
      answers what works; the second is the only thing that can contradict it.
    */
    const withArt = ranked.filter(
      (d) => d.image_url && /^https:\/\/i\.etsystatic\.com\//.test(d.image_url),
    );
    const loved = withArt.slice(0, Math.round(LOOK_AT * 0.66));

    const spreadPool = withArt.filter((d) => !loved.includes(d));
    const want = LOOK_AT - loved.length;
    const step = Math.max(1, Math.floor(spreadPool.length / Math.max(want, 1)));
    const spread = Array.from({ length: want }, (_, i) => spreadPool[i * step])
      .filter(Boolean);

    const looked = loved;
    content.push({
      type: "text",
      text: `\nYou are shown ${looked.length + spread.length} of this shop's ${designs.length} designs as artwork. The rest you have only as titles.\n\nFIRST, THE ${looked.length} DESIGNS THE HIGHEST SHARE OF VIEWERS SAVED. These are not a fair sample of the shop — they are its hits, and a shop's hits resemble each other.`,
    });
    for (const d of looked) {
      content.push({
        type: "text",
        text: `[${d.listing_id}] ${d.title} — ${(100 * saveRate(d)).toFixed(0)}% of ${d.views.toLocaleString()} viewers favorited it`,
      });
      content.push({
        type: "image",
        source: { type: "url", url: sized(d.image_url as string, BIG) },
      } as Anthropic.ImageBlockParam);
    }
    if (spread.length) {
      content.push({
        type: "text",
        text: `\nAND ${spread.length} TAKEN EVENLY FROM THE REST OF THE CATALOGUE, popular to unpopular. These are the ordinary run of the shop. Where they differ from the hits above, say so — and never describe the catalogue as if it all looked like the hits.`,
      });
      for (const d of spread) {
        content.push({
          type: "text",
          text: `[${d.listing_id}] ${d.title} — ${d.views.toLocaleString()} views, ${d.favorers.toLocaleString()} favorited`,
        });
        content.push({
          type: "image",
          source: { type: "url", url: sized(d.image_url as string, SMALL) },
        } as Anthropic.ImageBlockParam);
      }
    }

    content.push({
      type: "text",
      text: "Write the brief. Look at the artwork, not the products it is printed on.",
    });
  } else {
    const key = etsyKey();
    if (!key) {
      await settle();
      return NextResponse.json(
        { error: "This deployment has no Etsy key." },
        { status: 503 },
      );
    }

    let reviews;
    try {
      reviews = await reviewsFor(shop.etsy_shop_id as number, key, 400);
    } catch (e) {
      await settle();
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
        id: r.listing_id,
        title: r.listing_id ? byListing.get(r.listing_id) : undefined,
      }))
      .filter((r) => r.text.length >= 60)
      .slice(0, 160);

    if (useful.length < 8) {
      await settle();
      return NextResponse.json(
        {
          error:
            "This shop's reviews are almost all one-liners. There is nothing here to read.",
        },
        { status: 400 },
      );
    }

    content.push({
      type: "text",
      text: `SHOP: ${shop.shop_name}\n\n${useful.length} reviews that say something, each with the design it was written about.\n\n${useful
        .map(
          (r) =>
            `${r.title ? `[${r.id}] on "${r.title.slice(0, 70)}" — ` : ""}${r.text.slice(0, 400)}`,
        )
        .join("\n\n")}`,
    });
    content.push({
      type: "text",
      text: "Write the brief. Who are these people and why did they buy.",
    });
  }

  try {
    /*
      Cache everything, not just the system prompt.

      Fifty thousand tokens of catalogue and artwork get rebuilt identically
      on every re-read of the same shop, and re-reads are common — a refresh
      after an export, a second look an hour later. Marking the last block
      caches the lot for an hour, so the next read of that shop pays a tenth
      for its input.
    */
    const last = content[content.length - 1] as unknown as Record<
      string,
      unknown
    >;
    last.cache_control = { type: "ephemeral", ttl: "1h" };

    const model = kind === "buyers" ? TEXT_MODEL : MODEL;
    const res = await client.messages.create({
      model,
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
      model,
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

    const known = new Set(designs.map((d) => d.listing_id));
    const raw = call.input as Record<string, unknown>;
    const patterns = asPoints(raw.patterns)
      .filter((p) => p?.heading && p?.body)
      .map((p) => ({
        heading: String(p.heading).trim(),
        body: endWell(String(p.body).trim(), res.stop_reason),
        quote: p.quote ? String(p.quote).trim() : undefined,
        points: Array.isArray(p.points)
          ? (p.points as unknown[])
              .map((x) => String(x).trim())
              .filter(Boolean)
              .slice(0, 5)
          : undefined,
        /* Only ids that are really in this shop — a made-up one would render
           as a hole where a design should be. */
        examples: Array.isArray(p.examples)
          ? (p.examples as unknown[])
              .map((x) => Number(x))
              .filter((n) => Number.isFinite(n) && known.has(n))
              .slice(0, 3)
          : undefined,
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

    delivered = true;
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
  } finally {
    await settle();
  }
}
