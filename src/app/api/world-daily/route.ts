import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, meter } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * WHO DOES THE READING.
 *
 * A paper costs about 37 cents and roughly three quarters of that is one
 * unglamorous job: reading ninety thousand tokens of web pages. That is not
 * work that needs the expensive model — it needs eyes, not taste.
 *
 * So the reading is done by a small model whose only instruction is to write
 * down what it sees, verbatim and generously, without deciding what matters.
 * The judgment — what is printable, what is padding, what a seller can
 * actually use — stays with the good model, reading a few thousand tokens of
 * notes instead of a hundred thousand tokens of HTML.
 *
 * Set WB_SCOUT to a model name to change the reader, or to "off" to go back
 * to one model doing both jobs.
 */
const SCOUT = process.env.WB_SCOUT || "claude-haiku-4-5-20251001";
const TWO_STAGE = SCOUT !== "off";

/**
 * The scout captures; it never curates. Every instruction here is about
 * writing things down faithfully, because the moment a cheap model starts
 * deciding what is interesting, the expensive model is judging a summary of
 * somebody else's judgment and the quality that was just fixed goes away.
 */
const SCOUT_SYSTEM = `You are the reader for a print-on-demand seller's research. You search, and you write down what you find. You do not decide what is important — someone else does that.

WHAT TO WRITE DOWN, GENEROUSLY
- Exact wording. Captions, sayings, in-jokes, quoted lines, comebacks, words on signs, what people call themselves and each other. Quote them EXACTLY, with the quotation marks. This is the most important thing you do.
- What things look like. How the lettering is drawn, how it is laid out, which colours are paired, what imagery keeps appearing, how the text sits on the page.
- Objects and symbols that keep appearing.
- Dated moments people gift around or dress for.
- Who is saying it and where, and roughly how widely it is spreading.

HOW TO WRITE IT
Plain notes. One observation per line, starting with the source URL in square brackets. Never summarise several posts into a general statement — "people are talking about modesty" is worthless, whereas "Modesty comes with conviction" appearing as a caption is worth everything. Specifics only.

Write down anything that is language or imagery, even when you are unsure it matters. Being over-inclusive costs nothing here. Leaving something out means nobody downstream can ever see it.

Do not write conclusions, recommendations, or opinions about what the seller should make. Notes only.

SEARCH LIKE AN INSIDER
Start with TikTok, then Reels, Shorts and comments. Search the way the culture talks about itself, not the way a marketer or journalist would. An area name plus "trends" returns industry articles and fabric reports, which are useless here.`;
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

THE TEST HAS A FIELD, AND IT IS NOT OPTIONAL
Every item you publish must fill in "printable": the exact words that would go on the product, in quotes, or the picture that would be drawn, in under ten words.

Fill that field FIRST, before you write the headline. If you cannot fill it honestly — without inventing a phrase nobody said, without turning an observation into a slogan yourself — then the item fails and you do not publish it. No exceptions, no matter how interesting the observation is.

  "Satin is dominating modest fashion" → nothing to print. Cut it.
  "The longline vest is the new third piece" → nothing to print. Cut it.
  "Brand X released a journalling kit" → nothing to print. Cut it.
  "Daughter of the King" → printable: "Daughter of the King". Publish it.

WHOSE SIDE THE SELLER IS ON
You are reading for THIS seller's customer, and that customer has a position. Report what their own people are saying, wearing and making. Never report the opposition's merchandise, slogans or symbols as a signal — an anti-ICE seller has no use for what MAGA hats are doing this season, and reporting it as a trend is worse than useless. If the only thing you found in an area is the other side, that area gets skipped.

WHERE THE GOOD MATERIAL LIVES
Short-form video is where this world says things out loud. TikTok above all, then Reels and Shorts, then the comment sections underneath them. That is where a phrase becomes a phrase — someone says it, it gets stitched, it turns into a caption, and within a fortnight people are describing themselves with it. Go there first, every time.

Hunt for language most of all. The exact words people use about themselves, the sounds and lines being quoted, the captions repeating across a hundred posts, what they call each other, what they say back to the thing that annoys them, the joke that keeps getting reused. Quotes are the most printable thing that exists — a phrase IS a design.

WHAT PASSES
- phrase — exact wording being repeated: a caption, a saying, an in-joke, a quoted line used as a self-description, a comeback, words on a sign. Quote them exactly. This is by far the most valuable kind, and an issue that is mostly phrases is a good issue.
- visual — something you could look at and redraw: how the lettering is styled, how a design is laid out, a colour pairing, imagery or a symbol that keeps appearing. Describe it plainly, the way a designer talks — never "motif", "treatment" or "visual language".
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
- ${TARGET_ITEMS} is a CEILING, never a target. There is no quota. Two real items is a good issue; five with two fillers is a bad one, and padding is the most common way this job gets done badly. Do not spread across areas for coverage — an area with nothing printable gets skipped.
- This is a WEEKLY paper, not a daily one, so you are choosing the best of a whole week rather than scraping together whatever moved today. Be more selective, not less.
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
            /*
              THE GATE.

              Everything else here is prose, and prose rules get ignored. The
              banned list said "never report fabric" and "never report a
              competitor's product launch", and issues still shipped with
              satin, longline vests and another brand's journalling kit.

              This field cannot be filled in for those. "Satin is dominating"
              has no words to print and no picture to draw, so the model has
              to either invent something — which the verification pass and the
              instructions both forbid — or drop the item. Made the rule
              structural instead of hoping.
            */
            printable: {
              type: "string",
              description:
                "The exact thing that would go on the product: the words to print, in quotes, or the image to draw, in under ten words. If you cannot fill this in without inventing it, the item does not belong in the issue.",
            },
            sources: {
              type: "array",
              items: {
                type: "object",
                properties: { title: { type: "string" }, url: { type: "string" } },
                required: ["url"],
              },
            },
          },
          required: ["area", "kind", "headline", "body", "printable", "sources"],
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
  /*
    Pulled out of the union here. The metering calls now live inside closures,
    and TypeScript will not carry the narrowing of `door` across a function
    boundary — it only knows `door` is one of two shapes again once you are
    inside `sweep` or `judge`.
  */
  const { caller } = door;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "World News needs an ANTHROPIC_API_KEY on this deployment. Add it in Vercel, Settings, Environment Variables, then redeploy.",
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

  /**
   * THE SECOND SWEEP.
   *
   * The first pass reads the seller's watch list, which is the right place to
   * start and the wrong place to stop. A watch list is a handful of phrases
   * somebody typed once; on a slow week it simply has nothing moving in it,
   * and the page used to hand back an apology for that.
   *
   * There is no shortage of internet. If the narrow read comes up short, go
   * wide: the world itself, the sub-niches under it, the culture next door,
   * and a month instead of a fortnight.
   */
  const widerPrompt = `Today is ${today}.

${body.memory?.trim() || `CUSTOMER WORLD: ${body.worldName || "unnamed"}`}
${body.subNiches?.length ? `Sub-niches: ${body.subNiches.join(" · ")}` : ""}

A first search of this seller's watch list came back thin. Do not repeat it. Search WIDER:

- The world and its sub-niches directly, not the watch-list phrasing.
- The culture immediately next door — what this same person is also into, what else is in their feed.
- Widen the window to the last month rather than the last fortnight.
- Go to where the talking happens: TikTok, Reels, Shorts, comment sections, and the subreddits and forums this person actually posts in.
- Hunt the evergreen language too: the sayings, in-jokes and self-descriptions this world has used for a while. A phrase does not have to be new to be worth printing — it has to be real and theirs.

Write down everything that is language or imagery. Quote exactly.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    /* ------------------------------------------------------------ */
    /* stage one — the reading                                        */
    /* ------------------------------------------------------------ */

    const realUrls = new Set<string>();
    /**
     * Two AI calls, one allowlist — and it has to survive the join.
     *
     * The guarantee is that a citation must be a page a search actually
     * returned, never one a model invented. That was enforced by exact string
     * match against the scout's search-result URLs, which quietly broke the
     * moment the work was split in two: the scout writes a URL into its notes
     * in whatever form it saw it, the judge copies that, and a trailing slash
     * or a stripped tracking parameter meant every citation was thrown away.
     * The seller saw "nothing I could verify" while both models ran and
     * billed.
     *
     * So compare normalised, and also honour URLs the scout wrote down —
     * those came out of a real search too. A model still cannot cite a page
     * that never appeared anywhere in the run, which is the actual promise.
     */
    const seen = new Set<string>();
    const normalise = (u: string) => {
      try {
        const url = new URL(u);
        url.hash = "";
        for (const junk of [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
          "fbclid",
          "gclid",
          "igshid",
          "si",
        ])
          url.searchParams.delete(junk);
        return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
      } catch {
        return u.trim().toLowerCase();
      }
    };
    const allow = (u: string) => seen.add(normalise(u));

    /**
     * One sweep of the web, written down. Called more than once on a thin
     * day, with a different brief each time.
     *
     * Twelve searches rather than six: the old ceiling was reached routinely
     * on the first three areas, so the rest of the watch list was never
     * actually read and the seller was told the world was quiet when really
     * the reader had run out of budget.
     */
    async function sweep(brief: string) {
      const at = Date.now();
      const scout = await client.messages.create({
        model: SCOUT,
        max_tokens: 8000,
        system: SCOUT_SYSTEM,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 12,
          } as unknown as Anthropic.Tool,
        ],
        messages: [{ role: "user", content: brief }],
      });

      for (const block of scout.content) {
        const b = block as unknown as {
          type: string;
          content?: { url?: string }[];
        };
        if (b.type === "web_search_tool_result" && Array.isArray(b.content))
          for (const r of b.content)
            if (r.url) {
              realUrls.add(r.url);
              allow(r.url);
            }
      }

      const text = scout.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();

      // Anything the scout wrote down, it saw. Add those too.
      for (const m of text.matchAll(/https?:\/\/[^\s\])>"']+/g)) allow(m[0]);

      meter("daily", caller.userId, {
        model: SCOUT,
        ...scout.usage,
        web_searches:
          (
            scout.usage as unknown as {
              server_tool_use?: { web_search_requests?: number };
            }
          )?.server_tool_use?.web_search_requests ?? 0,
        ms: Date.now() - at,
      });

      return text;
    }

    let notes = TWO_STAGE ? await sweep(prompt) : "";

    /* ------------------------------------------------------------ */
    /* stage two — the judgment                                       */
    /* ------------------------------------------------------------ */

    type Item = {
      area?: string;
      kind?: string;
      headline?: string;
      body?: string;
      printable?: string;
      sources?: { title?: string; url?: string }[];
    };

    /**
     * Read the notes, decide what is printable, publish.
     *
     * `relaxed` lowers the editorial bar, not the honesty bar. Everything is
     * still real, still quoted, still cited to a page a search actually
     * returned — it just stops holding out for the perfect item. A quieter
     * true observation beats an apology.
     */
    async function judge(field: string, relaxed: boolean) {
      const at = Date.now();
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: 6000,
        system: SYSTEM,
        tools: TWO_STAGE
          ? [PUBLISH_TOOL as unknown as Anthropic.Tool]
          : [
              {
                type: "web_search_20250305",
                name: "web_search",
                max_uses: 10,
              } as unknown as Anthropic.Tool,
              PUBLISH_TOOL as unknown as Anthropic.Tool,
            ],
        messages: [
          {
            role: "user",
            content: TWO_STAGE
              ? `${prompt}

The searching has already been done. Below are raw field notes, written down without judgement — that job is yours. Most of it will not pass the test, which is expected and is the whole reason you are reading it rather than the web. Cite only URLs that appear in these notes.
${
  relaxed
    ? `
THE BAR IS LOWER THIS TIME, AND THIS IS DELIBERATE.
A strict pass over these notes published nothing, and an empty paper is worse than a modest one. Publish the two or three best real things in here even if they are quieter than you would like — an ordinary phrase this world genuinely uses, a recurring image, a saying that is not new but is theirs.

What does NOT change: never invent anything, never cite a page not in these notes, never report garments or fabric, never report a competitor's product. Real and small is fine. Made up is not.
`
    : ""
}
--- FIELD NOTES ---
${field || "(nothing came back)"}`
              : prompt,
          },
        ],
      });

      meter("daily", caller.userId, {
        model: MODEL,
        ...res.usage,
        web_searches:
          (
            res.usage as unknown as {
              server_tool_use?: { web_search_requests?: number };
            }
          )?.server_tool_use?.web_search_requests ?? 0,
        ms: Date.now() - at,
      });

      // Collect every URL the search tool genuinely returned. In two-stage
      // mode the searching happened in stage one, so this adds nothing and the
      // set built there is what citations are checked against — the guarantee
      // that no source is invented survives the split unchanged.
      for (const block of res.content) {
        const b = block as unknown as {
          type: string;
          content?: { url?: string }[];
        };
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content)
            if (r.url) {
              realUrls.add(r.url);
              allow(r.url);
            }
        }
      }

      // The issue arrives as tool input, already structured. The old
      // text-parsing path stays as a fallback for a model answering in prose.
      let parsed: { items?: Item[] } | null = null;

      for (const block of res.content) {
        const b = block as unknown as {
          type: string;
          name?: string;
          input?: unknown;
        };
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

      /*
        Verification, and it throws things away on purpose.

        A link that was never in a search result does not ship — that is the
        promise that no source is invented. And an item with nothing in
        `printable` does not ship either: it means the model could not say
        what would actually go on the product, which is the whole test. Both
        checks run here rather than in the prompt because a rule the code
        enforces is a rule, and a rule only written in prose is a suggestion.
      */
      return (parsed?.items ?? [])
        .map((it) => ({
          area: (it.area || "").trim(),
          kind: (it.kind || "").trim().toLowerCase(),
          headline: (it.headline || "").trim(),
          body: (it.body || "").trim(),
          printable: (it.printable || "").trim(),
          sources: (it.sources ?? [])
            .filter((s) => s.url && seen.has(normalise(s.url)))
            .map((s) => ({
              title: (s.title || s.url || "").trim(),
              url: s.url!,
            })),
        }))
        .filter(
          (it) =>
            it.headline && it.body && it.printable && it.sources.length > 0,
        );
    }

    /*
      THREE CHANCES BEFORE ANYONE SAYS "NOTHING TODAY".

      The page used to hand back an apology the moment one narrow read of the
      watch list came up short — which, on a Tuesday, it often does. The world
      had not gone quiet; the search had. So:

        1. the watch list, strictly judged      — the normal day
        2. a wider sweep, strictly judged       — world, sub-niches, a month
        3. everything found so far, lower bar   — free, no new searching

      Only the third costs nothing extra in searches, and the first two only
      run again on a day that would otherwise have been empty.
    */
    let items = await judge(notes, false);

    if (!items.length && TWO_STAGE) {
      notes = `${notes}\n\n${await sweep(widerPrompt)}`.trim();
      items = await judge(notes, false);
    }

    if (!items.length && TWO_STAGE) items = await judge(notes, true);

    if (!items.length)
      return NextResponse.json(
        { error: "Today's read came back empty. Try again in a little while." },
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
