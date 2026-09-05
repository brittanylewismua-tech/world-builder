import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { admit, meter, refund } from "@/lib/guard";
import { noteFailure } from "@/lib/noteFailure";
import { normalise, repairSource, usableSource } from "@/lib/sources";

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
Plain notes. One observation per line, starting with the source URL in square brackets.

WRITE THE WHOLE URL, EXACTLY AS IT APPEARS. The full path to the page the thing is actually on — every slash, every id. Never trim it back to the domain and never tidy it up. Downstream, that string is checked against the pages the search really returned, and a shortened link matches nothing, so a trimmed URL silently destroys the observation attached to it. Never summarise several posts into a general statement — "people are talking about modesty" is worthless, whereas "Modesty comes with conviction" appearing as a caption is worth everything. Specifics only.

Write down anything that is language or imagery, even when you are unsure it matters. Being over-inclusive costs nothing here. Leaving something out means nobody downstream can ever see it.

Do not write conclusions, recommendations, or opinions about what the seller should make. Notes only.

SEARCH LIKE AN INSIDER
Search the way the culture talks about itself, not the way a marketer or journalist would. An area name plus "trends" returns industry articles and fabric reports, which are useless here.

GO TO REDDIT FIRST
It is the best source you have and the easiest to skip. Three reasons:

1. It is TEXT. Short-form video hides its language inside the video, which is why searching TikTok so often lands on a /discover/ page — a keyword index with no actual post on it. On Reddit the words are written down and can be quoted exactly.
2. The communities are already sorted. Find the subreddits this person actually posts in and read those, rather than searching the topic in the abstract.
3. UPVOTES ARE A COUNT OF PEOPLE AGREEING WITH A SENTENCE. Nothing else you look at has this. Everywhere else you are guessing whether a phrase is spreading; here it is measured, and the number is on the page. A comment with four thousand upvotes is a line thousands of insiders endorsed.

So: search "<area> reddit", "site:reddit.com <area>", the subreddit names themselves, and the phrasings people would use inside those communities. Read the top comments, not just the post. WRITE THE SCORE DOWN when you can see it — "[4.2k upvotes]" next to a quote is the most useful thing you can hand over, because it is the difference between a phrase somebody said and a phrase a community agreed with.

Then the rest: TikTok, Reels, Shorts and their comment sections.`;
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

  COULD A DESIGNER DO SOMETHING WITH THIS?

Either because it hands them words and pictures directly, or because it tells them something about their world they can work from. If a signal only changes which blank you buy, it fails — that is not a decision this seller gets to make.

THAT TEST IS A FLOOR. IT IS NOT HOW YOU RANK.
Read this carefully, because getting it backwards produces a technically
correct and completely useless paper.

The test above decides what is allowed in. What goes FIRST is a different
question, and the answer is: whatever most changes how this seller
understands the person they are selling to.

The most literally printable thing is almost never the most valuable thing. A
list of breed names is maximally printable and teaches nobody anything — it
is a noun list, and the seller could have written it themselves. "This
community publicly corrects each other's failed bakes" is harder to put on a
shirt and worth ten times more, because it is a fact about how these people
behave that the seller did not know this morning.

So order the issue like this, best first:

1. Something that reveals how these people think, argue, worry, or show off.
   What they are anxious about. What they tease each other for. What they are
   quietly proud of. What divides them.
2. Exact language they actually use about themselves — quoted, with who said
   it and where.
3. A happening in the world that shifts the mood of it.
4. Objects, symbols and motifs that keep appearing.
5. Bare lists of names or terms. These go LAST when they go in at all.

A quote showing a real worry — "we'd love to free-range but we have hawks" —
belongs above any roster of anything. The seller can turn a worry into a joke
on a shirt. They cannot do anything with a list they already knew.

NOW THE SECOND QUESTION: IS IT CENTRAL, OR IS IT A CORNER?
Ranking by revelation alone puts the wrong story on the front page, because
the most surprising thing you found is often the thing furthest from what this
seller actually sells.

The centre is the NAME the seller gave this world, when they gave one. They
know what business they are in, and the name says it in one word. Keywords
cluster around whatever is easy to search, so counting them finds the most
searchable corner rather than the subject — a shop named "Feminist" whose
keywords lean on Medusa and Lilith is a feminist shop that prints mythology,
not a Greek mythology shop, and no amount of keyword arithmetic will say so.

Only when there is no name, or the name says nothing ("my shop", "store 2"),
read the keywords as a whole and find the subject most of them point at. The areas being searched are
spokes off that centre, and some sit much closer to it than others.

  THE LEAD STORY MUST COME FROM THE CENTRE.

Everything else can come from anywhere. A spoke that only two or three
keywords point at is a real part of this world and belongs in the issue — it
just does not open it. Somebody who opens this paper should recognise their
own shop in the first headline, not a neighbouring interest.

Worked example. A shop whose keywords are mostly feminist slogans, Medusa,
Lilith and Greek mythology, plus a few sapphic and LGBT ones, is a FEMINIST
shop that also serves a sapphic audience. A terrific find about who counts as
sapphic goes in the issue. It does not lead. The lead comes from the feminist
centre, even when the sapphic story is the more surprising one.

TWO WAYS TO GET THIS WRONG, AND THE SECOND IS WORSE.

The first is blandness. The centre is a subject, not a demand for the safest
take on it — a furious, specific, contested story from the centre beats a mild
one every time.

The second is collapse, and it has actually happened. Told to lead from the
centre, the paper came back with four items out of five about Greek mythology,
because a fifth of the keywords mentioned Medusa. It read like a completely
different shop. The seller sells feminist apparel; mythology is one thing she
prints, not the world she sells into.

The centre rule governs ONE slot. It says where the front page comes from and
nothing else. Once the lead is chosen, the rest of the issue ranges across the
world — the arguments, the humour, the identity language, the politics,
whatever the reading actually turned up. A world is not its largest keyword
cluster.

THE TEST HAS A FIELD, AND IT IS NOT OPTIONAL
Every item you publish must fill in "printable": the exact words that would go on the product, in quotes, or the picture that would be drawn, in under ten words.

If you cannot fill it honestly — without inventing a phrase nobody said, without turning an observation into a slogan yourself — then the item fails and you do not publish it. No exceptions, no matter how interesting the observation is.

Filling it is a gate, not a goal. Do not reach for the item with the most
obvious slogan in it; reach for the one that teaches the most, then say
plainly what a designer would take from it. For an observation about how
these people behave, the field is the idea — not a slogan you invented to
make it qualify.

  "Satin is dominating modest fashion" → a fabric. Nothing here for someone who prints on blanks. Cut it.
  "The longline vest is the new third piece" → a garment. Cut it.
  "Brand X released a journalling kit" → a press release. Cut it.
  "Daughter of the King" → printable: "Daughter of the King". Publish it.
  "MAGA hats have gone black-and-gold and meme-coded" → a news item. Printable: the hat is an in-joke now, not a slogan. Publish it.

The ONE exception is a "news" item, which is a happening rather than something to print. There, use the field for the idea a designer would take away from it.

THIS IS A PAPER ABOUT THE WORLD, NOT A FEED OF CUSTOMER QUOTES
The seller is building a whole world, and news from anywhere in it is fair game. What is blowing up, what a rival camp is wearing, what is selling, what people are arguing about. Ideas come out of news; you are not restricted to things the customer personally said.

So report what is HAPPENING in this world, from any direction, including the other side of the argument and including products. Use kind "news" for anything that is world news rather than a piece of customer language or imagery. There is no cap on how many — if the week's news is the story, the week's news is the issue.

What still does not belong, because there is nothing in it for anyone:
- A routine press release, a restock, a scheduled collection drop, a tour date. Marketing calendar, not news.
- Fabric, cut, fit and garment construction. The seller prints on blanks and cannot make a garment, so satin and longline vests are noise however big they get.
- Follower counts and chart positions as facts in themselves.

And never claim sales figures or demand you cannot see. "This is selling well on Etsy" is something you do not know. "This has forty thousand comments" is something you can see — say that instead.

WHERE THE GOOD MATERIAL LIVES
Reddit first, then short-form video. Reddit is where this world writes things down — the exact wording, in text, inside communities that have already sorted themselves by sub-niche. Short-form video is where a phrase spreads, and TikTok, Reels and the comment sections underneath them are worth reading too, but the language is easier to catch in writing than in a caption on a video you cannot watch.

A NUMBER BEATS AN IMPRESSION
When the notes carry a score — "[4.2k upvotes]", a comment count — treat it as the strongest evidence available that a phrase is real rather than one person's turn of phrase. You are usually judging whether something is spreading from indirect signals. A vote count is people agreeing, counted. Weight it accordingly, and say so plainly in the body: a line thousands of people upvoted is worth more than a caption seen once.

Hunt for language most of all. The exact words people use about themselves, the sounds and lines being quoted, the captions repeating across a hundred posts, what they call each other, what they say back to the thing that annoys them, the joke that keeps getting reused. Quotes are the most printable thing that exists — a phrase IS a design.

WHAT PASSES
- phrase — exact wording being repeated: a caption, a saying, an in-joke, a quoted line used as a self-description, a comeback, words on a sign. Quote them exactly. This is by far the most valuable kind, and an issue that is mostly phrases is a good issue.
- visual — something you could look at and redraw: how the lettering is styled, how a design is laid out, a colour pairing, imagery or a symbol that keeps appearing. Describe it plainly, the way a designer talks — never "motif", "treatment" or "visual language".
- object — a specific thing this world keeps depicting or naming, that could be drawn: a prop, a symbol, an animal, a plant, a tool, a food.
- humour — a joke format or running bit, quoted.
- aesthetic — a nameable micro-aesthetic with visual rules you can actually describe.
- news — something happening in this world worth knowing: a rival camp's slogan shifting register, a design or product blowing up, an argument breaking out. Say what it is and what is interesting about it.
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
- Publish ${TARGET_ITEMS}. That is the size of the paper, and on a normal week the reading turns up more than five things that pass the test, not fewer — the job is choosing the best five, not proving five exist.
- Cut below five only when the material genuinely is not there. Two strong items beat five with three fillers, and padding is a real failure. But so is the opposite, and it is the more common one here: refusing good material because it is not the single best thing you saw. A phrase real people are repeating passes. It does not have to be remarkable.
- Never come back with nothing. Across every area, over a whole week of live culture, there is always something; an empty issue is a failed search, not a high standard.
- AT MOST TWO ITEMS FROM ANY ONE AREA. This is a paper about a whole world, and five items about the same subject is not an issue, it is a single article cut into pieces. A seller reading it should recognise the range of what they sell, not one corner of it enlarged.
- That is a ceiling on repetition, not a demand for coverage. Do not go hunting for a weak item in an untouched area just to spread the issue out — if only three areas produced anything worth printing, publish three or four items and stop. Fewer good ones beats five with two fillers.
- This is a WEEKLY paper, not a daily one, so you are choosing the best of a whole week rather than scraping together whatever moved today. Be more selective, not less.
- Headline: short, concrete, naming the actual thing. When it is a phrase, the phrase IS the headline, in quotes.
- Body: two or three sentences, 70 words maximum. What it is, where it is showing up, and what it says about the person wearing it. Quote real wording exactly.
- Write like a well-edited culture newsletter. No bullet lists inside the body.

HARD RULES
1. NEVER tell the seller what to make. No "this would make a great shirt", no design directives. You surface the signal; they decide what it means.
2. NEVER invent a source. Only cite pages your searches actually returned. Three real observations beat five padded ones.
2a. COPY THE URL. DO NOT WRITE ONE.

Every note you are given begins with its URL in square brackets. That exact
string, character for character, is the source. Select it and reproduce it.

You will feel an urge to tidy it — to turn
[https://dykedomesticity.substack.com/p/a-theory-of-the-sapphic/comments]
into "https://dykedomesticity.substack.com" because the short one looks
cleaner. Do not. Every link is checked against the pages a search actually
returned, and a shortened link matches nothing, so the item is thrown away
before anybody reads it. An entire issue has been lost this way: two good
stories, both cited to homepages the model had trimmed itself, both dropped,
and the seller was shown an empty paper about a week that was not empty.

If a note has no URL in brackets, you cannot cite it. Use a different note.

2b. A SOURCE MUST BE A SPECIFIC PAGE. The individual post, video or article where you saw the thing — tiktok.com/@someone/video/123, not tiktok.com and not tiktok.com/discover/anything. A homepage, a search page or a hashtag index is not a source; an item whose only links are those is dropped before the seller sees it, so find the real page or drop the item yourself.
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
              enum: [
                "phrase",
                "visual",
                "object",
                "event",
                "humour",
                "aesthetic",
                "moment",
                // World news — happenings rather than customer language.
                "news",
              ],
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
      /*
        EVERYTHING ELSE THE SCOUT FOUND.

        The reading turns up forty things and the issue prints five, and the
        other thirty-five used to be thrown away — which is what World Web
        was built to recover, at the price of a second research run every
        week. It is cheaper and truer to keep them here: the model has
        already read them, so listing them costs a few hundred output tokens
        and no extra searching.

        They are held to the same evidence rule as the issue. A quote and a
        link that a search actually returned, or the entry does not exist.
        What they are not held to is being publishable — that is the whole
        point of the pile.
      */
      also: {
        type: "array",
        description:
          "Everything else real you found and did not print. Not padding, not summaries — actual things, each with the words and the page they came from.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description: "The thing itself, short. A phrase goes in as the phrase.",
            },
            note: {
              type: "string",
              description: "One plain sentence saying what it is.",
            },
            quote: {
              type: "string",
              description: "The exact wording from the page, as written.",
            },
            url: { type: "string" },
          },
          required: ["label", "quote", "url"],
        },
      },
    },
    required: ["items"],
  },
} as const;

interface Rest {
  label?: string;
  note?: string;
  quote?: string;
  url?: string;
}

interface Body {
  worldName?: string;
  areas?: string[];
  subNiches?: string[];
  /* Test only, cron-authenticated. See below. */
  judge?: string;
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

  /*
    NOTHING IS CHARGED FOR AN ISSUE THAT NEVER ARRIVED.

    The unit is reserved before the work, because that is what makes the
    check atomic. Every path out of here that does not hand back an issue
    gives it straight back — a timeout, a missing key, an empty read. The
    weekly cap used to be two so that a failure had a spare to fall back on;
    it is one now, because a failure no longer costs anything.
  */
  let delivered = false;
  const settle = async () => {
    if (!delivered) await refund(caller, "daily");
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    await settle();
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
    await settle();
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  /*
    WHICH MODEL JUDGES — OVERRIDABLE, BUT ONLY BY THE DEPLOYMENT.

    Trying a cheaper judge is the obvious cost lever, and the only honest way
    to evaluate it is to run the same world through both and read the two
    papers side by side. Doing that through WB_MODEL would swap the model for
    the customer, the Creative Room, the board and both pattern reads at the
    same time, which is a far bigger change than the question being asked.

    So the cron secret may name a judge for one run. A seller cannot: the
    header is the deployment's, and without it this is whatever WB_MODEL says.
  */
  const cronSecret = process.env.CRON_SECRET;
  const byCron =
    !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  const judgeModel = (byCron && body.judge?.trim()) || MODEL;

  const areas = (body.areas ?? []).filter(Boolean);
  if (!areas.length) {
    await settle();
    return NextResponse.json(
      { error: "Add at least one active world area in your World Profile." },
      { status: 400 },
    );
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `Today is ${today}.

${body.memory?.trim() || `CUSTOMER WORLD: ${body.worldName || "unnamed"}`}

${
  body.subNiches?.length
    ? `WHAT THIS SELLER ACTUALLY SELLS, TODAY:
${body.subNiches.map((k) => `- ${k}`).join("\n")}`
    : ""
}

AREAS TO WATCH:
${areas.map((a) => `- ${a}`).join("\n")}

${
  body.subNiches?.length
    ? `The keyword list is read fresh every time an issue is written, so it is
what this shop sells right now. Let it steer what is worth reporting.

Do not police it. A seller knows things about their own world that do not look
like a clean connection from outside — a keyword that seems unrelated to an
area is usually a judgement you do not have the context to make. What they
sell and what they watch are both their call.`
    : ""
}

Search for what is actually being said in these areas right now. Prioritise the last two weeks.

Start on Reddit: "<area> reddit", "site:reddit.com <area>", and the subreddits this person actually posts in. Read the top comments, and write down the upvote count beside anything you quote. Then TikTok and the rest — "<area> tiktok caption", "<area> quotes", "<area> shirt sayings", and the phrasings insiders use about themselves.

Search the way someone inside that culture talks, never the way a marketer or journalist would. An area name plus "trends" returns industry articles and fabric reports, which is exactly the material this seller cannot use. You are hunting for language and imagery.

Then write the newspaper. ${TARGET_ITEMS} items unless the material honestly is not there — never none, and never fewer just to seem selective. Every item must change what somebody would print on a shirt.

Then fill in "also" with everything else real you found and did not print — the phrases, moments, jokes and images that did not make the issue. Each one needs the exact words and the page they came from. This is not padding and not a summary: it is the rest of what you read, kept because the seller may see something in it that you did not. This is the bulk of your output, not an afterthought. You read dozens of pages to write five items; almost everything you saw and passed over belongs here. If the notes contain thirty real quoted things and you printed five, this list has about twenty-five in it — coming back with seven means you threw away work the seller has already paid for.

Keep each one tight so a long entry does not crowd out the next: a short label, one sentence, the quote, the link. Never invent one to lengthen the list, and never include anything you could not link to.`;

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
    /* The same pages, unmangled — a repaired citation has to be a real link,
       and `seen` holds only the normalised forms used for comparison. */
    const seenRaw = new Set<string>();
    const allow = (u: string) => {
      seenRaw.add(u);
      return seen.add(normalise(u));
    };

    /**
     * One sweep of the web, written down. Called more than once on a thin
     * day, with a different brief each time.
     *
     * Eight searches rather than six. Twelve was the first correction and it
     * overshot — searches are a cent each and drive the reading cost with
     * them, so the ceiling went straight into the bill twice over. Eight
     * still covers a seven-area watch list, which six did not.
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
            max_uses: 8,
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
      /*
        STREAMED, WHICH IS WHAT LETS THE CEILING BE HONEST.

        A plain request is refused outright once max_tokens is high enough
        that the SDK thinks the call could run past ten minutes — that is why
        this sat at sixteen thousand, and sixteen thousand was then hit
        exactly, twice, cutting the issue off mid-write. A truncated tool call
        still parses into whatever items completed, so the failure looks
        identical to a quiet week.

        Streaming lifts that restriction, so the ceiling can be set where the
        work actually needs it instead of where a non-streamed request is
        allowed to ask for. Nothing is streamed to anybody — no seller is
        watching this, it runs on a schedule — the final message is awaited
        exactly as before. It is the transport that changes, not the shape.
      */
      const streamed = client.messages.stream({
        model: judgeModel,
        /*
          The judge writes the issue AND everything else it read.

          This ceiling has now been hit twice. It was 6000, and the first run
          after "the rest" was added came back at exactly 6000 — cut off
          before reaching them, which is why nothing was kept. So it went to
          12000, and a new seller's very first issue came back at exactly
          12000: three items published, the rest of the write lost.

          Both times the failure was invisible. A truncated tool call still
          parses into whatever items completed, so a cut-off run looks exactly
          like a short one, and the seller reads three items believing that is
          all their world had in it.

          Sixteen thousand, and stop_reason is checked below rather than
          trusted. Output is billed on what is used, so a ceiling nobody
          reaches costs nothing; a ceiling somebody reaches costs the issue.

          NOT HIGHER, AND THIS WAS LEARNED THE HARD WAY. Twenty-four thousand
          was tried first and the SDK refused the request outright: past a
          certain ceiling it estimates the call could run over ten minutes and
          demands streaming instead. The run failed immediately with
          "Streaming is required for operations that may take longer than 10
          minutes" — so the number cannot simply be raised until it feels
          safe. Sixteen is a third more room than the ceiling that was hit,
          and still inside what a plain request is allowed to ask for.

          Streaming is the real answer if this is ever reached again. It is
          not a change to make hours before a launch.
        */
        max_tokens: 32000,
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
      /* Nobody is watching the tokens arrive; only the finished message. */
      const res = await streamed.finalMessage();

      meter("daily", caller.userId, {
        model: judgeModel,
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

      /*
        WAS IT CUT OFF?

        A tool call that runs into max_tokens still parses — the SDK hands
        back whatever fields completed — so a truncated issue is
        indistinguishable from a short one unless this is checked. That is how
        a seller came to read three items and reasonably conclude their world
        had three things in it.

        It is not treated as a failure. Three real items are worth publishing
        and the seller should not lose them to a retry. But it is said out
        loud, because a ceiling being hit is a thing to know about rather than
        discover twice.
      */
      if (res.stop_reason === "max_tokens")
        console.error(
          "[world-daily] the judge hit max_tokens — this issue is short " +
            "because it was cut off, not because the week was quiet.",
          { model: judgeModel, output: res.usage?.output_tokens },
        );

      // The issue arrives as tool input, already structured. The old
      // text-parsing path stays as a fallback for a model answering in prose.
      let parsed: { items?: Item[]; also?: Rest[] } | null = null;

      for (const block of res.content) {
        const b = block as unknown as {
          type: string;
          name?: string;
          input?: unknown;
        };
        if (b.type === "tool_use" && b.name === "publish_issue") {
          parsed = b.input as { items?: Item[]; also?: Rest[] };
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
      /*
        The rest gets the same link check as the issue and nothing else. A
        page no search returned is invented, whether it was going to be
        printed or not.
      */
      const also = (parsed?.also ?? [])
        .map((r) => ({
          label: (r.label || "").trim(),
          note: (r.note || "").trim(),
          quote: (r.quote || "").trim(),
          url: (r.url || "").trim(),
        }))
        .filter(
          (r) =>
            r.label &&
            r.quote &&
            r.url &&
            seen.has(normalise(r.url)) &&
            usableSource(r.url),
        )
        .map((r) => ({ ...r, url: repairSource(r.url!, seenRaw, normalise) ?? r.url! }));

      const raw = (parsed?.items ?? []) as Item[];
      const items = raw
        .map((it) => ({
          area: (it.area || "").trim(),
          kind: (it.kind || "").trim().toLowerCase(),
          headline: (it.headline || "").trim(),
          body: (it.body || "").trim(),
          printable: (it.printable || "").trim(),
          sources: (it.sources ?? [])
            /*
              Repair first, then verify. A citation the judge shortened to a
              bare domain is put back on the one real page it can only have
              meant; anything still unrecognised after that is dropped as
              before. The order matters — verifying first would throw away
              every repairable link, which is the bug this exists for.
            */
            .map((s) => ({
              ...s,
              url: s.url ? (repairSource(s.url, seenRaw, normalise) ?? s.url) : s.url,
            }))
            .filter(
              (s) => s.url && seen.has(normalise(s.url)) && usableSource(s.url),
            )
            .map((s) => ({
              title: (s.title || s.url || "").trim(),
              url: s.url!,
            })),
        }))
        .filter(
          (it) =>
            it.headline && it.body && it.printable && it.sources.length > 0,
        );

      /*
        WHY AN ISSUE CAME BACK EMPTY, WRITTEN DOWN.

        Every link is checked against the set of URLs a search genuinely
        returned, and an item whose sources all fail that check is dropped —
        correctly, because a fabricated source is worse than a missing story.
        But the drop was silent, and silence made the two possible failures
        look identical from outside: a world with nothing happening in it, and
        a judge that wrote five good items and cited pages the scout never
        handed it. One is a quiet week. The other is a bug, and it cost hours
        of guessing tonight because the numbers to tell them apart existed for
        a few milliseconds and were never written anywhere.

        Only on an empty result. A healthy issue logs nothing.
      */
      if (!items.length && raw.length)
        await noteFailure(
          "daily",
          `The judge published ${raw.length} items and every one was dropped`,
          {
            wrote: raw.length,
            citedUrls: raw.flatMap((it) =>
              (it.sources ?? []).map((x) => x.url).filter(Boolean),
            ).slice(0, 12),
            searchUrls: [...seen].slice(0, 12),
            searchUrlCount: seen.size,
            relaxed,
            stop: res.stop_reason,
          },
        );

      return { items, also };
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
    let out = await judge(notes, false);

    if (!out.items.length && TWO_STAGE) {
      notes = `${notes}\n\n${await sweep(widerPrompt)}`.trim();
      out = await judge(notes, false);
    }

    if (!out.items.length && TWO_STAGE) out = await judge(notes, true);

    if (!out.items.length)
      return NextResponse.json(
        { error: "Today's read came back empty. Try again in a little while." },
        { status: 502 },
      );

    /*
      The issue is capped; the rest is not. Nothing the scout found is thrown
      away any more — the five that pass the printable test are the paper, and
      everything else real sits behind it.
    */
    delivered = true;
    return NextResponse.json({
      items: out.items.slice(0, TARGET_ITEMS),
      also: out.also,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Research failed." },
      { status: 500 },
    );
  } finally {
    await settle();
  }
}
