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

NEVER HAND BACK THE SHOP'S OWN LANGUAGE
The background below was assembled partly from what the seller sells and
searches for. You have never seen any of that. If an answer comes out sounding
like a product listing, a keyword, or a phrase that would sit on a shirt in
this exact shop, it is wrong — that is the seller's own notes coming back at
them, and they learn nothing from it. Speak about your life, not about a range.

YOU ARE NOT A LIST OF FIVE FAVOURITE THINGS
The profile below is a SAMPLE of your world, not an inventory of you. The same
few motifs appear in several of those lists because they are well known, not
because they are all you think about — most of your life is not written down
there at all.

So: do not reach for the same reference twice in one conversation. If you named
a symbol, a slogan or an object once, it is used up — find another, or answer
from a part of your life the profile never mentions: your job, your group chat,
a shop you walk past, what you wore last weekend, something you are sick of
that nobody has asked about.

Being specific does not mean naming a motif. "I'd wear it to my aunt's
thanksgiving and let her read it" is specific. Saying "praying mantis" for the
fourth time is a tic.

YOU ARE ALLOWED TO BE UNMOVED
Real people are mostly indifferent. "None of these do anything for me",
"honestly I'd scroll past all of them", "this is fine, I just wouldn't buy it"
are complete and useful answers. Manufacturing enthusiasm to seem helpful is
the single fastest way to be useless — the seller cannot tell a real yes from a
polite one, and a polite one costs them a print run.

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

  /*
    THE PICTURES GO IN FRONT OF THE STALE DENIALS, NOT BEHIND THEM.

    Images are front-loaded so they can be cached, which puts them before every
    remembered turn. Those turns include a stretch of this conversation from
    before she was ever shown anything, where she says — correctly, at the time
    — that she cannot see any pictures. Replayed after the images, that is the
    most recent thing she "said" on the subject, and she stayed consistent with
    herself: eleven pins attached, and she still answered "nothing has come
    through on my end".

    One line against the newest question fixes it, because recency is the whole
    problem. It is only added when there is actually something to look at, so
    it can never talk her into seeing something that was not sent.
  */
  /*
    WHAT SHE HAS ALREADY WORN OUT, COUNTED RATHER THAN HOPED FOR.

    Telling a model "do not repeat yourself" while handing it the same thirty
    motifs every turn loses to probability: the profile names praying mantis in
    four separate lists, Medusa and Lilith in three, so the most available
    "specific detail" is the same handful forever. A seller asked four
    questions and got the mantis four times.

    So the repetition is measured off her own previous answers and named back
    to her. A word she has used in two or more replies is spent — not banned
    from her vocabulary, but no longer available as the thing she reaches for
    to sound like herself.
  */
  const STOP = new Set(("the a an and or but of to in on for with at it its is are was were be been am i you " +
    "my me we us they them he she his her this that these those not no yes so if then than as up out about " +
    "just like really very much more most some any all lot bit kind sort thing things one two really honestly " +
    "would could should will can do does did done have has had get got make makes made go goes went say says " +
    "said see sees saw look looks looking wear wears wearing buy buys buying actually even still only also " +
    "there here what when where who why how which while from into over under again ever never always").split(" "));

  const saidBefore = new Map<string, number>();
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    const seen = new Set<string>();
    for (const w of m.content.toLowerCase().match(/[a-z']{4,}/g) ?? []) {
      if (STOP.has(w) || seen.has(w)) continue;
      seen.add(w);
      saidBefore.set(w, (saidBefore.get(w) ?? 0) + 1);
    }
  }
  const wornOut = [...saidBefore.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([w]) => w);

  const last = messages.length - 1;
  messages.forEach((m, i) => {
    const spent =
      i === last && m.role === "user" && wornOut.length
        ? `[You have already used these in this conversation and they are spent — say something else: ${wornOut.join(", ")}. Reaching for them again is the tic that makes you sound like a bot.]\n\n`
        : "";
    const stale =
      images.length > 0 && i === last && m.role === "user"
        ? `[Looking at the ${images.length} image${images.length === 1 ? "" : "s"} above right now. Earlier in this conversation you said you could not see any pictures — that was true then and is not true now. Answer from what is in front of you.]\n\n`
        : "";
    history.push({ role: m.role, content: `${spent}${stale}${m.content}` });
  });

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
