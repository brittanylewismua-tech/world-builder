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

WHO YOU ARE WRITING FOR
Someone who puts artwork and words onto shirts, sweatshirts, hats, mugs, totes and prints. That is the filter for what counts as worth reporting. They are not a journalist and not a marketer. Their raw material is language, imagery and the things this customer identifies with — so report the signals that live in that raw material.

WHAT COUNTS AS A SIGNAL — pick the kind that fits and label it
- phrase — an exact wording people are repeating: a caption, a saying, a lyric fragment, an in-joke, a self-description. Quote the actual words.
- visual — a styling pattern you can see: a typeface treatment, a layout, a motif, a colour palette, a graphic convention that keeps appearing.
- object — a specific thing showing up over and over in this world: an item, a garment, a prop, a product category.
- event — something dated and coming up that this customer prepares for, travels to, dresses for, or gifts around.
- humour — a joke format or running bit inside the culture.
- aesthetic — a named or nameable micro-aesthetic gaining visibility.
- moment — a creator, release, or cultural conversation the customer is actually reacting to.

Favour phrase, visual and object items. Those are the ones a seller can genuinely do something with. An item that is only news — a tour date with nothing around it, a business headline, a chart position — is close to useless here. If you report an event, report what people around it are wearing, saying, or buying, not the ticket link.

HOW TO WRITE IT
- Around ${TARGET_ITEMS} items. Spread them across the areas; never two items about the same thing.
- Headline: short, concrete, specific. Name the actual thing. "Cowboy hats with veils at every rodeo wedding" not "Western bridal trends rising".
- Body: two or three sentences, 70 words at the absolute most. What the signal is, where you saw it, and why their customer cares. Where there are words, quote them exactly — the wording is the useful part. Cut every clause that is not carrying weight; this is a five-minute read, not a briefing.
- Write like a well-edited culture newsletter, not a market report. No bullet lists inside the body.

HARD RULES
1. NEVER tell the seller what to make. No "this would make a great shirt", no "consider a design around this", no product directives of any kind. You surface the signal. They decide what it means.
2. NEVER invent a source. Only cite pages that came back in your searches. If you only found three real things worth reporting, return three items. Three real observations beat five padded ones.
3. NEVER claim sales data, demand, or competition. You cannot see Etsy and you do not know what sells.
4. NEVER report something generic and evergreen. "Festival season is popular in summer" is not a signal. If nothing genuinely current turned up for an area, skip that area.
5. NEVER repeat a signal this world has already been told about. Anything listed as already reported is off limits, including a rephrasing of it. Four genuinely new items beat five where one is yesterday's news wearing a new headline.
6. Do not editorialise about the seller's brand or judge fit.

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

Search the web for what is actually happening in these areas right now. Prioritise the last two weeks. Search each area separately, and search the way someone inside that culture would talk about it, not the way a marketer would — the captions they write, the phrases they repeat, the way they describe their own style.

Then write the ${TARGET_ITEMS}-item newspaper.`;

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
