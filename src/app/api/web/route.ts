import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { meter, ownerOf } from "@/lib/guard";
import { serviceDb } from "@/lib/pinterest";
import { normalise, usableSource } from "@/lib/sources";

export const runtime = "nodejs";
export const maxDuration = 300;

const SCOUT = process.env.WB_SCOUT || "claude-haiku-4-5-20251001";
const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * GROW THE WEB.
 *
 * The seller's keywords come from eRank, which is Etsy search data: what
 * somebody types into a shop when they are already shopping. A world is much
 * bigger than that. A chant, a person's name, a sign somebody carried, a
 * running joke — none of those will ever be an Etsy keyword and all of them
 * are printable.
 *
 * This reads the open web for that other half and attaches whatever it finds
 * to whichever keyword it belongs near.
 *
 * The reading is the same job World News does, and that is deliberate: the
 * scout already goes out every week, finds forty things, publishes five and
 * throws the rest away. Here nothing is thrown away — being generous is the
 * point, because this is a map rather than an edition.
 *
 * The one hard rule is evidence. A node without an exact quote and a link to
 * a real page is a string, and a screen full of strings was the last version
 * of this idea. Anything that cannot carry both is dropped before it is
 * written.
 */

const SCOUT_SYSTEM = `You read the open web for a print-on-demand seller and write down what you find. You do not decide what matters — that is somebody else's job.

WHAT YOU ARE LOOKING FOR
Things that belong to this customer's world but would never be typed into an Etsy search box. Etsy keywords are people shopping. You are after the world those people live in:

- Exact phrases. Chants, captions, sayings, in-jokes, comebacks, words on signs and placards, what people call themselves and each other.
- Names. People this world is talking about right now, and what they did.
- Moments. Something that happened that this world reacted to.
- Symbols and imagery that keep appearing.
- Running jokes and joke formats.

QUOTE EXACTLY, AND ALWAYS WITH ITS SOURCE
Every single line you write must start with the URL in square brackets, then the exact wording in quotation marks, then one plain sentence saying what it is. A note without a URL is worthless downstream and will be thrown away.

WRITE THE NUMBER DOWN when you can see one — "[4.2k upvotes]", a comment count. That is the difference between one person's turn of phrase and a line a community agreed with.

GO TO REDDIT FIRST
It is text, so the words can be quoted exactly; the communities are already sorted by sub-niche; and upvotes are a count of people agreeing with a sentence, which nothing else you look at gives you. Search "<term> reddit", "site:reddit.com <term>", the subreddit names themselves, and read the top COMMENTS, not just the posts. Then TikTok, Reels, Shorts and their comment sections, and news where something actually happened.

BE GENEROUS
Write down thirty things, not five. Being over-inclusive costs nothing here. Something you leave out is something nobody downstream can ever see.

Never write conclusions, recommendations, or opinions about what the seller should make.`;

const PLACE_SYSTEM = `You are sorting field notes into a map of one customer world.

The seller's keywords come from Etsy search data. The notes in front of you are the rest of the world — the things that will never be an Etsy keyword and are still printable. Your job is to take each real find and attach it to whichever of the seller's keywords it belongs nearest.

ONE NODE PER THING FOUND. Be generous — this is a map that accumulates, not an edition with a word count. Twenty-five good nodes is a good result.

EVERY NODE NEEDS ALL OF THIS OR IT DOES NOT EXIST:
- label: the thing itself, short. A phrase goes in as the phrase. A person goes in as their name. Never a description of a thing.
- anchor: exactly one of the seller's keywords, copied character for character from the list given. Whichever this sits nearest. Never invent one.
- quote: the exact wording from the notes, as it was written. Never your paraphrase.
- note: ONE plain sentence saying what this is and why it is in this world. For a name, say who they are and what happened — a name with no explanation is useless to somebody who has never heard it.
- url: the source URL from the notes, copied exactly.

Drop anything you cannot fill all five for. No exceptions.

ALSO CARRY, WHEN THE NOTES HAVE IT:
- score: the upvote or comment count as a plain number.
- seen_on: the date, as YYYY-MM-DD.

WHAT DOES NOT GO IN
- Anything already in the seller's keyword list. Those are the spine; you are adding what is around them.
- Fabric, cut, fit, garment construction. This seller prints on blanks.
- A press release, a restock, a tour date.
- Generic observations. "People care about immigration" is not a node. "No human is illegal" is.
- Anything you cannot quote.

Never say the notes were thin, uneven, or missing anything. Never suggest looking elsewhere. You are sorting what is here.`;

const PLACE_TOOL = {
  name: "place_nodes",
  description: "Attach what was found to the world's keywords.",
  input_schema: {
    type: "object",
    properties: {
      nodes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            anchor: { type: "string" },
            quote: { type: "string" },
            note: { type: "string" },
            url: { type: "string" },
            score: { type: "number" },
            seen_on: { type: "string" },
          },
          required: ["label", "anchor", "quote", "note", "url"],
        },
      },
    },
    required: ["nodes"],
  },
} as const;

export async function POST(req: Request) {
  let body: { worldId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const worldId = body.worldId;
  if (!worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, worldId);
  if ("deny" in door) return door.deny;

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json(
      { error: "This deployment is missing its ANTHROPIC_API_KEY." },
      { status: 503 },
    );

  const db = serviceDb();

  // Once a day. Reading the web is the expensive part and the world does not
  // turn over between one morning and the next.
  const { data: last } = await db
    .from("wb_web_runs")
    .select("ran_at")
    .eq("world_id", worldId)
    .order("ran_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    const hours =
      (Date.now() - new Date(last.ran_at as string).getTime()) / 3_600_000;
    if (hours < 20)
      return NextResponse.json(
        { error: "The web has already grown today. There will be more tomorrow." },
        { status: 429 },
      );
  }

  const { data: world } = await db
    .from("wb_worlds")
    .select("name")
    .eq("id", worldId)
    .maybeSingle();

  const { data: niches } = await db
    .from("wb_sub_niches")
    .select("keyword")
    .eq("world_id", worldId);

  const keywords = (niches ?? [])
    .map((n) => (n.keyword as string).trim())
    .filter(Boolean);

  if (!keywords.length)
    return NextResponse.json(
      { error: "Add your validated keywords first — they are the spine of the web." },
      { status: 400 },
    );

  // The spine, written once so the picture has something to hang off.
  await db.from("wb_web_nodes").upsert(
    keywords.map((k) => ({
      world_id: worldId,
      kind: "keyword",
      label: k,
      anchor: null,
    })),
    { onConflict: "world_id,kind,label", ignoreDuplicates: true },
  );

  // What is already on the web, so the same thing is not found twice.
  const { data: existing } = await db
    .from("wb_web_nodes")
    .select("label")
    .eq("world_id", worldId);
  const known = new Set(
    (existing ?? []).map((n) => (n.label as string).toLowerCase()),
  );

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    /* --------------------------------------------------- the reading */
    const scoutAt = Date.now();
    const scout = await client.messages.create({
      model: SCOUT,
      max_tokens: 8000,
      system: SCOUT_SYSTEM,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 10,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Customer world: ${world?.name || "unnamed"}.

The seller sells into these, and they came from Etsy search data:
${keywords.map((k) => `- ${k}`).join("\n")}

Go and read what this world is actually saying and doing right now — the parts that would never be an Etsy search. Quote exactly, always with the URL, and write down the upvote count wherever you can see one.

Already on the map, so do not bring these back: ${[...known].slice(0, 200).join(" · ") || "(nothing yet)"}`,
        },
      ],
    });

    /*
      Compared normalised, not raw.

      The first version matched URL strings exactly and threw away every node
      in the run because of it — the search tool returns a link with a
      tracking parameter, the model writes it down without one, and a page
      fails to match itself. World News had the same bug and the same fix; it
      simply did not get carried across.
    */
    const seen = new Set<string>();
    for (const block of scout.content) {
      const b = block as unknown as { type: string; content?: { url?: string }[] };
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const r of b.content) if (r.url) seen.add(normalise(r.url));
    }
    const notes = scout.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    // Anything the scout wrote down, it saw.
    for (const m of notes.matchAll(/https?:\/\/[^\s\])>"']+/g))
      seen.add(normalise(m[0]));

    meter("web", door.userId, {
      model: SCOUT,
      ...scout.usage,
      web_searches:
        (scout.usage as unknown as {
          server_tool_use?: { web_search_requests?: number };
        })?.server_tool_use?.web_search_requests ?? 0,
      ms: Date.now() - scoutAt,
    });

    /* -------------------------------------------------- the placing */
    const placeAt = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: [
        {
          type: "text",
          text: PLACE_SYSTEM,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      tools: [PLACE_TOOL as unknown as Anthropic.Tool],
      messages: [
        {
          role: "user",
          content: `The seller's keywords — an anchor must be one of these, copied exactly:
${keywords.map((k) => `- ${k}`).join("\n")}

--- FIELD NOTES ---
${notes || "(nothing came back)"}`,
        },
      ],
    });

    meter("web", door.userId, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - placeAt,
    });

    type Node = {
      label?: string;
      anchor?: string;
      quote?: string;
      note?: string;
      url?: string;
      score?: number;
      seen_on?: string;
    };
    let parsed: { nodes?: Node[] } | null = null;
    for (const block of res.content) {
      const b = block as unknown as { type: string; name?: string; input?: unknown };
      if (b.type === "tool_use" && b.name === "place_nodes") {
        parsed = b.input as { nodes?: Node[] };
        break;
      }
    }

    const anchors = new Map(keywords.map((k) => [k.toLowerCase(), k]));

    /*
      Everything is checked before it is written. A node has to name a real
      keyword, carry a quote and a note, and link to a page that actually
      goes somewhere — the same gate World News citations pass. Silently
      keeping a node that fails any of those is how the last version of this
      became a list of meaningless strings.
    */
    const rows = (parsed?.nodes ?? [])
      .map((n) => {
        const label = (n.label ?? "").trim();
        const anchor = anchors.get((n.anchor ?? "").trim().toLowerCase());
        const quote = (n.quote ?? "").trim();
        const note = (n.note ?? "").trim();
        const url = (n.url ?? "").trim();
        if (!label || !anchor || !quote || !note) return null;
        if (!url || !usableSource(url) || !seen.has(normalise(url))) return null;
        if (known.has(label.toLowerCase())) return null;
        known.add(label.toLowerCase());
        return {
          world_id: worldId,
          kind: "found",
          label: label.slice(0, 120),
          anchor,
          quote: quote.slice(0, 600),
          note: note.slice(0, 400),
          url,
          source: hostOf(url),
          score: Number.isFinite(n.score) ? Math.round(n.score as number) : null,
          seen_on: /^\d{4}-\d{2}-\d{2}$/.test(n.seen_on ?? "")
            ? n.seen_on
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const proposed = parsed?.nodes?.length ?? 0;

    /*
      A run that wrote nothing does not count as today's run.

      The first one recorded itself, added zero, and then locked the seller
      out for twenty hours with an empty page and no way to try again. A daily
      ceiling is there to stop a cost running away, and a grow that produced
      nothing has not cost anything worth protecting.
    */
    if (!rows.length)
      return NextResponse.json(
        {
          error:
            proposed > 0
              ? "Nothing came back that could be checked all the way to its source. Try again."
              : "Nothing came back this time. Try again.",
        },
        { status: 502 },
      );

    await db.from("wb_web_nodes").upsert(rows, {
      onConflict: "world_id,kind,label",
      ignoreDuplicates: true,
    });

    await db
      .from("wb_web_runs")
      .insert({ world_id: worldId, added: rows.length });

    return NextResponse.json({ ok: true, added: rows.length, proposed });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That did not finish." },
      { status: 502 },
    );
  }
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
