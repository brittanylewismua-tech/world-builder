import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, meter } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";
const TARGET_ITEMS = 5;

/**
 * WORLD DAILY
 *
 * SPEC: "approximately five distilled daily updates... Actual source links
 *        underneath each... It should not tell the seller 'You should make a
 *        shirt about this.' The goal is customer immersion, not automated
 *        product directives."
 *
 * Every link is verified against what the search tool actually returned before
 * it reaches the seller. An item whose URL was not in a real search result gets
 * dropped rather than shown. A fabricated source is worse than a missing one.
 */
const SYSTEM = `You research a print-on-demand seller's customer world and write them a very short daily newspaper.

WHAT THIS SELLER CAN ACTUALLY CHANGE — read this twice
They print artwork and words onto blank shirts, sweatshirts, hats, mugs, totes and prints. They buy the blanks. They cannot change the garment, the cut, the fabric, or the manufacturing. The ONLY thing they control is what is printed on it.

So there is one test, and every item must pass it:

  WOULD THIS CHANGE WHAT SOMEONE PRINTS ON A SHIRT?

Not "is this interesting about the world". Not "is this happening". Would it change the words or the artwork. If a signal only changes which blank you buy, it fails. If it is only news, it fails.

WHERE THE GOOD MATERIAL LIVES
Short-form video is where this world says things out loud. TikTok above all, then Reels and Shorts, then the comment sections underneath them. That is where a phrase becomes a phrase — someone says it, it gets stitched, it turns into a caption, and within a fortnight people are describing themselves with it. Go there first, every time.

Hunt for language most of all. The exact words people use about themselves, the sounds and lines being quoted, the captions repeating across a hundred posts, what they call each other, what they say back to the thing that annoys them, the joke that keeps getting reused. Quotes are the most printable thing that exists — a phrase IS a design.

WHAT PASSES
- phrase — exact wording being repeated: a caption, a saying, an in-joke, a quoted line used as a self-description, a comeback, words on a sign. Quote them exactly. This is by far the most valuable kind, and an issue that is mostly phrases is a good issue.
- visual — a graphic move you can see and reproduce: a typeface treatment, a layout convention, a colour pairing, a recurring motif or symbol, a way text is being set.
- object — a specific thing this world keeps depicting or naming, that could be drawn: a prop, a symbol, an animal, a plant, a tool, a food.
- humour — a joke format or running bit, quoted.
- aesthetic — a nameable micro-aesthetic with visual rules you can actually describe.
- event — only when there is a dated moment people GIFT around or DRESS for, and you can say what gets printed for it. A date alone is not a signal.
- moment — sparingly, and only when the reaction to it is producing language or imagery.

WHAT FAILS — never report these, however current
- Fabric, silhouette, cut, fit or garment construction. Satin, longline vests, oversized fits, drop shoulders. The seller cannot make those.
- Another brand's product launch, collection, or restock. Competitor news is not customer language.
- A song, album, artist or tour merely existing. Report it only when a specific line is being quoted as a self-description — and then it is a phrase item, and the quote is the point.
- Ticket sales, chart positions, follower counts, business or industry news.
- Anything a seller reads and thinks "interesting, but I cannot do anything with that".

A worked example, so the bar is unmistakable:
  GOOD — "Saved, not soft" used as a self-description, tagged on faith-and-worship clips, pushing back against a soft, sanitised image of belief.
    Why: those are exact words somebody would wear.
  BAD — A modest-fashion brand released a new scripture-journalling kit.
    Why: a competitor's product. Nothing to print.
  BAD — The longline vest is becoming the layering piece of the year.
    Why: a garment. The seller does not make garments.

HOW TO WRITE IT
- Up to ${TARGET_ITEMS} items, and FEWER IS BETTER when the rest would be padding. Three that pass beat five with two fillers. Do not spread across areas for coverage — an area with nothing printable gets skipped.
- Headline: short, concrete, naming the actual thing. When it is a phrase, the phrase IS the headline, in quotes.
- Body: two or three sentences, 70 words maximum. What it is, where it is showing up, and what it says about the person wearing it. Quote real wording exactly.
- Write like a well-edited culture newsletter. No bullet lists inside the body.

HARD RULES
1. NEVER tell the seller what to make. No "this would make a great shirt", no design directives. You surface the signal; they decide what it means.
2. NEVER invent a source. Only cite pages your searches actually returned. Three real observations beat five padded ones.
3. NEVER claim sales data, demand, or competition. You cannot see Etsy and do not know what sells.
4. NEVER report something generic or evergreen. "Faith-based apparel is popular" is not a signal.
5. NEVER repeat a signal already reported to this world, or a rephrasing of it.
6. Do not editorialise about the seller's brand or judge their fit.

OUTPUT
When you have finished searching, call the publish_issue tool with the items. Do not write the issue out as text — the tool is the only way it reaches the seller.`;

/**
 * The issue comes back through a tool rather than as text.
 *
 * Asking for raw JSON worked until a headline contained a quotation mark —
 * and in this product headlines are frequently a quoted phrase, because the
 * exact wording is the useful part. One unescaped quote and the whole issue
 * failed to parse. A tool schema makes that structurally impossible.
 */
const PUBLISH_TOOL = {
  name: "publish_issue",
  description: "Publish today's issue of this seller's World Daily.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            area: { type: "string", description: "Which watched area this belongs to." },
            kind: {
              type: "string",
              enum: ["phrase", "visual", "object", "event", "humour", "aesthetic", "moment"],
            },
            headline: { type: "string" },
            body: { type: "string" },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" }, url: { type: "string" } },
                required: ["url"],
              },
            },
          },
          required: ["area", "kind", "headline", "body", "sources"],
        },
      },
    },
    required: ["items"],
  },
} as const;

interface Body {
  worldName?: string;
  areas?: string[];
  subNiches?: string[];
  /** Everything this world already knows — see lib/context.ts. */
  memory?: string;
}

export async function POST(req: Request) {
  const door = await admit(req, "daily");
  if ("deny" in door) return door.deny;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "World Daily needs an ANTHROPIC_API_KEY on this deployment. Add it in Vercel, Settings, Environment Variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const areas = (body.areas ?? []).filter(Boolean);
  if (!areas.length)
    return NextResponse.json(
      { error: "Add at least one active world area in your World Profile." },
      { status: 400 },
    );

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Today is ${today}.

${body.memory?.trim() || `CUSTOMER WORLD: ${body.worldName || "unnamed"}`}
${!body.memory && body.subNiches?.length ? `Sub-niches the seller sells into: ${body.subNiches.join(" · ")}` : ""}

AREAS TO WATCH:
${areas.map((a) => `- ${a}`).join("\n")}

Search for what is actually being said in these areas right now. Prioritise the last two weeks, and start with TikTok — search terms like "<area> tiktok", "<area> tiktok caption", "<area> trending sound", "<area> quotes", "<area> shirt sayings", and the phrases insiders would use about themselves.

Search the way someone inside that culture talks, never the way a marketer or journalist would. An area name plus "trends" returns industry articles and fabric reports, which is exactly the material this seller cannot use. You are hunting for language and imagery.

Then write the newspaper. Up to ${TARGET_ITEMS} items, fewer if fewer pass the test. Every item must change what somebody would print on a shirt.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const began = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 12,
        } as unknown as Anthropic.Tool,
        PUBLISH_TOOL as unknown as Anthropic.Tool,
      ],
      messages: [{ role: "user", content: prompt }],
    });

    /*
      The most expensive call in the product: a long generation on top of up
      to twelve live web searches, once per seller per day. If a price is
      going to be wrong anywhere, it will be wrong here — so the searches are
      counted alongside the tokens.
    */
    const searchCount =
      (res.usage as unknown as { server_tool_use?: { web_search_requests?: number } })
        ?.server_tool_use?.web_search_requests ?? 0;
    meter("daily", door.caller.userId, {
      model: MODEL,
      ...res.usage,
      web_searches: searchCount,
      ms: Date.now() - began,
    });

    // Collect every URL the search tool genuinely returned.
    const realUrls = new Set<string>();
    for (const block of res.content) {
      const b = block as unknown as {
        type: string;
        content?: { url?: string }[];
      };
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) if (r.url) realUrls.add(r.url);
      }
    }

    // The issue arrives as tool input, already structured. The old
    // text-parsing path stays as a fallback for a model that answers in prose.
    type Item = {
      area?: string;
      kind?: string;
      headline?: string;
      body?: string;
      sources?: { title?: string; url?: string }[];
    };
    let parsed: { items?: Item[] } | null = null;

    for (const block of res.content) {
      const b = block as unknown as { type: string; name?: string; input?: unknown };
      if (b.type === "tool_use" && b.name === "publish_issue") {
        parsed = b.input as { items?: Item[] };
        break;
      }
    }

    if (!parsed) {
      const text = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first !== -1 && last !== -1) {
        try {
          parsed = JSON.parse(cleaned.slice(first, last + 1));
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed)
      return NextResponse.json(
        {
          error:
            "Today's research came back in a shape I could not read. Nothing was saved — try again.",
        },
        { status: 502 },
      );

    // Verification pass. A link that was never in a search result does not ship.
    const items = (parsed.items ?? [])
      .map((it) => ({
        area: (it.area || "").trim(),
        kind: (it.kind || "").trim().toLowerCase(),
        headline: (it.headline || "").trim(),
        body: (it.body || "").trim(),
        sources: (it.sources ?? [])
          .filter((s) => s.url && realUrls.has(s.url))
          .map((s) => ({ title: (s.title || s.url || "").trim(), url: s.url! })),
      }))
      .filter((it) => it.headline && it.body && it.sources.length > 0);

    if (!items.length)
      return NextResponse.json(
        {
          error:
            "Nothing came back with a source I could verify. Rather than show you links that might not exist, I am showing you nothing. Try again in a moment.",
        },
        { status: 502 },
      );

    return NextResponse.json({ items: items.slice(0, TARGET_ITEMS) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Research failed." },
      { status: 500 },
    );
  }
}
