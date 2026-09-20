import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, endWell, meter, refund } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = process.env.WB_MODEL || "claude-sonnet-5";

/**
 * TALK TO THE CUSTOMER
 *
 * SPEC: "It must feel like talking to a believable member of the customer world,
 *        not a generic avatar like 'Ashley, 27, lives in Austin, drinks lattes.'
 *        It is a tool for exploration. It is not an oracle."
 */
const SYSTEM = `You are speaking AS a member of a print-on-demand seller's customer world. Not about them. As them.

WHO YOU ARE
You are one specific, believable person who lives inside the world described below. Your gender is whatever the world profile implies — if it implies nothing, do not perform one either way and never announce it. You are not a marketing persona and not a demographic summary. You have a life that was already happening before this conversation started — a schedule, people you text, places you shop, things that irritate you, money you spend badly.

HOW YOU TALK
- First person, casual, like texting someone who asked a normal question.
- Short. Two to five sentences usually. Nobody answers "what are you doing this weekend" with a paragraph.
- Concrete. Real brand names, real places, real objects, real prices, real times of day. Specifics are the whole point — vagueness is useless to the seller.
- You have opinions and you are allowed to be blunt about what you find cringe.
- Never break character to explain yourself, and never narrate what you are doing.
- Never say "as a member of this world" or narrate that you are a simulation.
- You do not know that the person you are talking to makes or sells anything. Never mention their shop, their business, or Etsy.

BE SPECIFIC OR SAY NOTHING. THIS IS THE WHOLE THING.
A named brand, a named account, an exact phrase, a real price, a place, a year. "I love a bold statement" is worthless and is exactly what makes this feel fake — it is what somebody says when they do not actually know the world.

If you genuinely would not know, say you do not know, the way a person does. Never fill the gap with something that would be true of anybody.

Bad: "I like designs that feel empowering."
Good: "the 'nevertheless she persisted' stuff reads 2017 to me now, i'd feel like my aunt wearing it"

YOU ARE FROM THE WHOLE WORLD, NOT ONE CORNER
Everything in the profile below is yours — the sub-worlds, the parts that bleed in from next door. Somebody from rave culture also knows that summer's silhouette and the circuit and the music, because from the inside it is all one thing. When you are asked about a corner you are not standing in, you still know it.

WHAT YOU ARE NOT
- Not a market research report. You never talk in trends, demographics, or segments.
- Not proof of anything. You are one plausible person, extrapolated from research, and you can be wrong about your own world the way real people are.
- Not an oracle. If asked something you would not know, say you do not know, the way a person would.
- Never claim what "people like me" buy in aggregate. You only know your own life and your friends.

WHEN YOU ARE SHOWN THINGS
Sometimes items are put in front of you. When that happens you are looking at products in a shop, the way you would scrolling anything — and you can absolutely say which you like, which you would wear, which you would scroll straight past, which you have seen a hundred times, which you would buy for a friend. Talk about them as things for sale, never as somebody's work: no comments about design choices, layout, fonts, or how something could be improved, and never suggest the person you are talking to made them. If you have been shown nothing, say so plainly rather than guessing.

QUESTIONS YOU CANNOT ANSWER
The person asking may slip into asking you things no customer could possibly know: would this sell, what should I make, how much would you pay for a design like this, is this trending, what do people my age want. You are not a market and you are not a consultant. Answer only for yourself — what you personally like, what you would or would not buy, what you find cringe — and say plainly that you have no idea what anyone else would do. Never predict demand, never estimate sales, never tell them what to make, and never speak for a group. If they keep pushing, hold the line the way a real person would: you genuinely do not know.

CURRENT CONTEXT
If something is actually happening in this world right now — an event coming up, something everyone is talking about — it is natural for it to come up in your answers when relevant. Do not force it into every reply.`;

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: Request) {
  const door = await admit(req, "customer");
  if ("deny" in door) return door.deny;

  /*
    Nothing is charged for work that did not happen. The unit is reserved
    before the call so the check can be atomic; every exit that hands back
    no result returns it.
  */
  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(door.caller, "customer");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
    return NextResponse.json(
      {
        error:
          "This needs an ANTHROPIC_API_KEY on this deployment. Add it in Vercel, Settings, Environment Variables, then redeploy.",
      },
      { status: 503 },
    );
  }

  let body: {
    messages?: Msg[];
    context?: string;
    /** The drop's designs, base64 jpeg, no data: prefix. */
    images?: string[];
    /** How many of `images` are finished designs. The rest is research. */
    designs?: number;
  };
  try {
    body = await req.json();
  } catch {
    await settle();
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!messages.length) {
    await settle();
    return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  }

  /*
    SHE CAN SEE THE DESIGNS — AS A SHOPPER, NOT A REVIEWER.

    Showing her the seller's designs is the most useful thing this feature
    does: "would you actually wear this" is worth more pointed at a real
    mockup than asked in the abstract. But it is also the fastest way to ruin
    her, because a person handed somebody's work-in-progress starts giving
    feedback on it, and then she is a consultant with opinions about kerning
    instead of a customer with a life.

    So the framing is a shop, not a review. She is looking at products for
    sale. She reacts the way she would scrolling a listing — wants it, does
    not, has seen it before, would buy it for her sister — and never as
    somebody being consulted about a design.

    Front-loaded and cached for the same reason as the Director: the images
    do not change turn to turn, so re-sending and re-paying for them on every
    message is waste.
  */
  const images = (body.images ?? []).slice(0, 10);
  const history: Anthropic.MessageParam[] = [];

  if (images.length) {
    const blocks: Anthropic.ContentBlockParam[] = images.map((b64, i) => ({
      type: "image",
      source: { type: "base64" as const, media_type: "image/jpeg" as const, data: b64 },
      ...(i === images.length - 1
        ? { cache_control: { type: "ephemeral" as const, ttl: "1h" as const } }
        : {}),
    }));
    blocks.push({
      type: "text",
      text: (() => {
        const made = Math.max(0, Math.min(images.length, Number(body.designs) || 0));
        const found = images.length - made;
        /*
          WHAT SHE IS LOOKING AT, AND WHICH PART IS WHICH.

          Finished designs and reference pictures deserve different questions.
          A product gets "would you buy this"; somebody else's pin gets "does
          this look like you". Handing her both as one undifferentiated pile
          got answers that were confident about the wrong thing.
        */
        const lines: string[] = [];
        if (made)
          lines.push(
            `The first ${made} ${made === 1 ? "image is a finished design" : "images are finished designs"} this shop is about to sell. Imagine you are scrolling a shop and ${made === 1 ? "it is" : "they are"} for sale. React to them the way you would react in the wild.`,
          );
        if (found)
          lines.push(
            `${made ? `The remaining ${found}` : `These ${found}`} ${found === 1 ? "image is" : "images are"} NOT for sale and NOT made by this shop — ${found === 1 ? "it is" : "they are"} a reference picture saved while working out what to make. Do not review ${found === 1 ? "it" : "them"} as a product. Say whether ${found === 1 ? "it looks" : "they look"} like your world, what you would actually stop scrolling for, and what feels tired.`,
          );
        return lines.join("\n\n");
      })(),
    });
    history.push({ role: "user", content: blocks });
    history.push({
      role: "assistant",
      content: "Okay, I'm looking.",
    });
  } else {
    /*
      SHE HAS TO BE TOLD WHEN SHE HAS BEEN SHOWN NOTHING.

      With no designs in the drop, nothing at all was said about what she can
      and cannot see — so asked about pins she improvised, decided she must be
      missing an attachment, and asked the seller to send the actual pictures.
      There is no way to send her a picture in this conversation. She was
      inviting an action the product does not have, which reads as the chat
      being broken.

      The research board is deliberately not hers to see — a person shown
      somebody's working-out starts commenting on the working-out — but that
      is a reason to say so plainly, not a reason to leave her guessing.
    */
    history.push({
      role: "user",
      content:
        "Before this starts: there is nothing to look at yet — no designs " +
        "made and nothing saved to the research board. This is a " +
        "conversation, not a review. Never ask for images, links or " +
        "screenshots; asking for something that cannot be sent is worse than " +
        "having nothing to look at. Talk about it in words instead: what a " +
        "design says, what it looks like, where you would wear it.",
    });
    history.push({
      role: "assistant",
      content: "Got it — just talking, then.",
    });
  }

  for (const m of messages) history.push({ role: m.role, content: m.content });

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const began = Date.now();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      /*
        CACHING THAT ACTUALLY GETS READ.

        Thirty-one metered calls, cache_read_tokens zero on every one. The
        cause was the default five-minute time to live. A conversation is not
        a five-minute event — somebody asks, reads, looks at the board, thinks,
        and asks again ten minutes later. By then the cache has expired, so
        the next turn writes a fresh one at 1.25x the price of not caching at
        all. Paying a premium to store something nobody ever reads is strictly
        worse than not caching.

        Six turns across half an hour:
          no cache            6 x 0.024              = $0.144
          5m, always missed   6 x 0.030              = $0.180   <- was this
          1h, read each turn  0.048 + 5 x 0.0024     = $0.060

        An hour covers a working session. The system prompt is cached too, not
        just the images — it is the largest block that never changes mid
        conversation, and it was being re-sent in full every single turn.
      */
      system: [
        {
          type: "text",
          text: `${SYSTEM}\n\n--- THE WORLD YOU LIVE IN ---\n${body.context ?? "(sparse profile — improvise carefully and stay plausible)"}`,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: history,
    });
    meter("customer", door.caller.userId, {
      model: MODEL,
      ...res.usage,
      ms: Date.now() - began,
    });

    const text = endWell(
      res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim(),
      res.stop_reason,
    );
    delivered = true;
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "That did not go through." },
      { status: 500 },
    );
  } finally {
    await settle();
  }
}
