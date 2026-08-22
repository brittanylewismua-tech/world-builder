import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

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

WHAT YOU ARE LOOKING FOR
Signals inside the areas the seller asked you to watch. Any of these count:
a phrase appearing repeatedly · a meme gaining traction · a visual styling pattern · an event approaching · a cultural conversation · an object or motif showing up everywhere · a micro-aesthetic gaining visibility · a recurring joke · a lifestyle behaviour · a creator or celebrity moment · a seasonal ritual starting · an adjacent interest becoming visible.

HOW TO WRITE IT
- One item per area at most. Around ${TARGET_ITEMS} items total.
- Headline: short, concrete, specific. Name the actual thing. "Cowboy hats with veils at every rodeo wedding" not "Western bridal trends rising".
- Body: two or three sentences. What the signal is, where you saw it, and enough context that the seller understands why it is interesting to their customer.
- Write like a well-edited culture newsletter, not a market report. No bullet lists inside the body.

HARD RULES
1. NEVER tell the seller what to make. No "this would make a great shirt", no "consider a design around this", no product directives of any kind. You surface the signal. They decide what it means.
2. NEVER invent a source. Only cite pages that came back in your searches. If you only found three real things worth reporting, return three items. Three real observations beat five padded ones.
3. NEVER claim sales data, demand, or competition. You cannot see Etsy and you do not know what sells.
4. NEVER report something generic and evergreen. "Festival season is popular in summer" is not a signal. If nothing genuinely current turned up for an area, skip that area.
5. Do not editorialise about the seller's brand or judge fit.

OUTPUT
After searching, return ONLY raw JSON. No markdown fence, no preamble:
{"items":[{"area":"the area this belongs to","headline":"...","body":"...","sources":[{"title":"page title","url":"https://..."}]}]}`;

interface Body {
  worldName?: string;
  areas?: string[];
  subNiches?: string[];
}

export async function POST(req: Request) {
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

CUSTOMER WORLD: ${body.worldName || "unnamed"}
${body.subNiches?.length ? `Sub-niches the seller sells into: ${body.subNiches.join(" · ")}` : ""}

AREAS TO WATCH:
${areas.map((a) => `- ${a}`).join("\n")}

Search the web for what is actually happening in these areas right now. Prioritise the last two weeks. Search each area separately, and search the way someone inside that culture would talk about it, not the way a marketer would.

Then write the ${TARGET_ITEMS}-item newspaper.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
      ],
      messages: [{ role: "user", content: prompt }],
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

    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1)
      return NextResponse.json(
        { error: "The research came back unreadable. Try again." },
        { status: 502 },
      );

    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      items?: {
        area?: string;
        headline?: string;
        body?: string;
        sources?: { title?: string; url?: string }[];
      }[];
    };

    // Verification pass. A link that was never in a search result does not ship.
    const items = (parsed.items ?? [])
      .map((it) => ({
        area: (it.area || "").trim(),
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
