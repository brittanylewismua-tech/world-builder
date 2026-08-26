import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";
import { normalise, usableSource } from "@/lib/sources";

export const runtime = "nodejs";
export const maxDuration = 300;

const SCOUT = process.env.WB_SCOUT || "claude-haiku-4-5-20251001";

/**
 * WHERE THE WEB IS LOSING ITS FINDINGS.
 *
 * "Nothing came back" says the placing model proposed no nodes at all, which
 * puts the fault upstream of every check in the route — either the scout
 * returned nothing readable, or its notes came back in a shape the placer
 * could not work from.
 *
 * Guessing at that has already cost two rounds. This runs the reading half
 * alone and reports exactly what it produced: how many searches it ran, how
 * long the notes are, how many URLs are in them, and the first stretch of the
 * notes themselves.
 *
 * Guarded by CRON_SECRET. Deleted once it has answered.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.CRON_SECRET ||
    url.searchParams.get("secret") !== process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const worldId = url.searchParams.get("world");
  if (!worldId)
    return NextResponse.json({ error: "Pass ?world=<uuid>" }, { status: 400 });

  const db = serviceDb();
  const { data: niches } = await db
    .from("wb_sub_niches")
    .select("keyword")
    .eq("world_id", worldId);
  const keywords = (niches ?? []).map((n) => (n.keyword as string).trim());

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const scout = await client.messages.create({
      model: SCOUT,
      max_tokens: 8000,
      system:
        "You read the open web and write down what you find. One line per observation, each starting with the source URL in square brackets, then the exact wording in quotation marks, then one plain sentence saying what it is.",
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 6,
        } as unknown as Anthropic.Tool,
      ],
      messages: [
        {
          role: "user",
          content: `Read what this world is saying right now. Quote exactly, always with the URL.\n\n${keywords.map((k) => `- ${k}`).join("\n")}`,
        },
      ],
    });

    const blockTypes = scout.content.map((b) => b.type);
    const notes = scout.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    const resultUrls: string[] = [];
    for (const block of scout.content) {
      const b = block as unknown as { type: string; content?: { url?: string }[] };
      if (b.type === "web_search_tool_result" && Array.isArray(b.content))
        for (const r of b.content) if (r.url) resultUrls.push(r.url);
    }
    const inNotes = [...notes.matchAll(/https?:\/\/[^\s\])>"']+/g)].map((m) => m[0]);

    return NextResponse.json({
      keywords,
      stopReason: scout.stop_reason,
      blockTypes,
      searches:
        (scout.usage as unknown as {
          server_tool_use?: { web_search_requests?: number };
        })?.server_tool_use?.web_search_requests ?? 0,
      notesLength: notes.length,
      urlsFromSearch: resultUrls.length,
      urlsInNotes: inNotes.length,
      usableInNotes: inNotes.filter(usableSource).length,
      matchedAfterNormalise: inNotes.filter((u) =>
        new Set(resultUrls.map(normalise)).has(normalise(u)),
      ).length,
      notesHead: notes.slice(0, 2500),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "failed" },
      { status: 500 },
    );
  }
}
