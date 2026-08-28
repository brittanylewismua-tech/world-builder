import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";
export const maxDuration = 300;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * WHAT DID THE MODEL ACTUALLY SEND BACK?
 *
 * Two blind fixes in a row is two too many. The read has failed twice with
 * symptoms rather than causes — first .filter on a non-array, then an empty
 * brief — and each time I have inferred the reason instead of looking.
 *
 * This makes the identical call and returns the response untouched: the stop
 * reason, the kinds of block that came back, and the raw tool input as JSON.
 * No parsing, no coercion, nothing that can hide the problem.
 *
 * Guarded by CRON_SECRET. Deleted the moment it has answered.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (
    !process.env.CRON_SECRET ||
    url.searchParams.get("secret") !== process.env.CRON_SECRET
  )
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const db = serviceDb();
  const { data: shop } = await db
    .from("wb_shops")
    .select("id, shop_name")
    .order("added_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!shop) return NextResponse.json({ error: "No shops." }, { status: 404 });

  const { data: rows } = await db
    .from("wb_shop_designs")
    .select("title, image_url, views, favorers")
    .eq("shop_id", shop.id);

  const designs = (rows ?? []) as {
    title: string;
    image_url: string | null;
    views: number;
    favorers: number;
  }[];

  const rate = (d: (typeof designs)[number]) =>
    d.views >= 150 ? d.favorers / d.views : 0;

  const looked = [...designs]
    .filter(
      (d) => d.image_url && /^https:\/\/i\.etsystatic\.com\//.test(d.image_url),
    )
    .sort((a, b) => rate(b) - rate(a))
    .slice(0, 24);

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `SHOP: ${shop.shop_name}\n\nTHE WHOLE CATALOGUE\n${designs
        .sort((a, b) => b.favorers - a.favorers)
        .map(
          (d) =>
            `${d.title} — ${d.views} views, ${d.favorers} saved${d.views >= 150 ? ` (${(100 * rate(d)).toFixed(0)}%)` : ""}`,
        )
        .join("\n")}`,
    },
  ];

  for (const d of looked) {
    content.push({ type: "text", text: d.title });
    content.push({
      type: "image",
      source: {
        type: "url",
        url: (d.image_url as string).replace(
          /il_(fullxfull|\d+x[N\d]+)\./i,
          "il_570xN.",
        ),
      },
    } as Anthropic.ImageBlockParam);
  }
  content.push({ type: "text", text: "Write the brief." });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system:
        "You are looking at a print-on-demand shop. Say what it keeps doing, in five to seven plain findings, strongest first. Short ordinary words.",
      tools: [
        {
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
                  },
                  required: ["heading", "body"],
                },
              },
            },
            required: ["patterns"],
          },
        } as unknown as Anthropic.Tool,
      ],
      tool_choice: { type: "tool", name: "write_brief" },
      messages: [{ role: "user", content }],
    });

    const call = res.content.find((b) => b.type === "tool_use");

    return NextResponse.json({
      shop: shop.shop_name,
      designs: designs.length,
      images: looked.length,
      stop_reason: res.stop_reason,
      usage: res.usage,
      blocks: res.content.map((b) => b.type),
      toolName: call && call.type === "tool_use" ? call.name : null,
      // Untouched. Whatever is wrong will be visible in here.
      rawInput:
        call && call.type === "tool_use"
          ? JSON.stringify(call.input).slice(0, 3000)
          : null,
      text: res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .slice(0, 800),
    });
  } catch (e) {
    return NextResponse.json(
      {
        failed: true,
        name: e instanceof Error ? e.name : "",
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
