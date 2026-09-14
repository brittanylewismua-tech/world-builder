/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { NeedsSetupPage, needsSetup } from "@/components/NeedsSetup";
import ReadingBar from "@/components/ReadingBar";
import ShopNews from "@/components/ShopNews";
import { Page, Card, Empty, ErrorNote, Dots } from "@/components/ui";
import {
  formatIssueDate,
  hostOf,
  hideRest,
  nextIssueDate,
  generateIssue,
  loadIssue,
  sweepShops,
  loadIssueDates,
  startFirstIssue,
  loadRest,
  type DailyRest,
  weekStartISO,
  startWrite,
  pendingWrite,
  clearWriting,
  type DailyItem,
} from "@/lib/daily";
import { deriveAreas } from "@/lib/api";
import { saveSignalToBoard } from "@/lib/board";
import { splitDrops, syncSchedule, type Drop } from "@/lib/drops";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/world";

/*
  There is no label on a card any more.

  Every item used to be announced — "a phrase", "a joke", "an aesthetic" —
  which is the tool narrating its own filing system. A reader looking at a
  quoted phrase can see that it is a phrase. The label taught them nothing and
  took the top of the card to do it.
*/

/**
 * KEEPING A SIGNAL.
 *
 * "Keep this for next week" read like a commitment — as though pressing it
 * set the direction of the next drop. It never did. It files the signal on
 * the research board, which is a collection of things worth looking at and
 * nothing more; the seller decides what any of it means when they get there,
 * and can throw it away.
 *
 * So the words say filing, not deciding. "Save" rather than "keep for",
 * "your board" rather than a drop number.
 */
function KeepIt({
  item,
  drop,
  onKeep,
  state,
}: {
  item: DailyItem;
  drop: Drop | null;
  onKeep: (item: DailyItem) => void;
  state: "idle" | "saving" | "kept" | "failed";
}) {
  if (!drop) return null;
  if (state === "kept")
    return (
      <span className="t-small font-medium text-ink-2">
        Saved to your board
      </span>
    );
  return (
    <button
      onClick={() => onKeep(item)}
      disabled={state === "saving"}
      className="t-small font-medium text-ink-2 underline underline-offset-2 transition hover:text-ink disabled:opacity-50"
    >
      {state === "saving"
        ? "Saving…"
        : state === "failed"
          ? "That did not save — try again"
          : "Save to my board"}
    </button>
  );
}

/**
 * WHAT "LOOK IT UP" SEARCHES, AND WHY IT IS NOT THE HEADLINE.
 *
 * It used to search the headline. Headlines here are written to be read on
 * the page, not typed into a search box: "Bandanas designed to be
 * photographed, not just worn" is a good line and a hopeless query. Nobody on
 * the internet has written that sentence, so the button opened onto nothing —
 * next to a source chip that worked.
 *
 * What a seller wants from this button is to SEE THE THING FOR THEMSELVES,
 * beyond the one page it was found on. So the query is built from the part of
 * the item that exists out in the world:
 *
 *   A phrase people actually say is searched exactly, in quotes. That is the
 *   string that will turn up on other people's posts, which is the proof the
 *   seller is looking for — one blog said it, or everybody is saying it.
 *
 *   Everything else is searched as its subject plus the area it came from.
 *   The area is what stops a stripped-down headline from being ambiguous:
 *   "bandanas carry the dog's name" alone is thin, and with "dog mom culture"
 *   after it, it lands where the seller expects.
 *
 * And when the item is about how something LOOKS, it opens image results,
 * because reading a description of a visual trend is not the point of it.
 */
/**
 * ...AND WHY IT IS NOW ALLOWED TO NOT EXIST.
 *
 * The first fix stopped it searching the raw headline and searched the quoted
 * phrase instead — but only when there WAS a quoted phrase. When there was
 * not, it fell back to the headline with the area appended, which is the same
 * bug wearing a coat: "Bandanas designed to be photographed, not just worn dog
 * mom culture" is not a query anybody has ever typed and returns nothing
 * useful. The button still sat there on every card, promising a search, and
 * roughly half of them opened onto a page of unrelated results.
 *
 * A button that works sometimes is worse than a button that is absent, because
 * a seller cannot tell in advance which one they are pressing, and after two
 * dead ones they stop trusting the ones that work.
 *
 * So it returns null when there is nothing real to search for, and the card
 * simply does not draw it. What is left is a link that is always a proper
 * search for words that genuinely exist out there — an exact phrase people
 * say, which is the whole reason a seller wants this: to find out whether one
 * blog said it or everybody is saying it.
 */
function lookupTarget(item: DailyItem): string | null {
  const phrase = (t: string) =>
    t?.match(/["“]([^"”]{2,80})["”]/)?.[1]?.trim() || undefined;

  /* The printable line holds the real words more often than the headline. */
  const said = phrase(item.printable) ?? phrase(item.headline);

  /*
    No quoted phrase, no search. The one exception is a visual item, where the
    subject plus its area is a genuinely reasonable image query — "flash tattoo
    lettering" in "witchy aesthetics" returns the look, and looking is the
    entire point of an image search. Prose still gets stripped back to
    something typeable rather than sent whole.
  */
  const visual = item.kind === "visual" || item.kind === "aesthetic";

  if (said)
    return `https://www.google.com/search?q=${encodeURIComponent(`"${said}"`)}${
      visual ? "&tbm=isch" : ""
    }`;

  if (!visual) return null;

  const subject = item.headline
    .replace(/["“”]/g, "")
    .replace(/[.,;:]+$/, "")
    /* A headline is a sentence; an image query is a noun phrase. Keep the
       first clause and drop the commentary that follows the comma. */
    .split(/[,—–]/)[0]
    .trim();
  if (subject.split(/\s+/).length > 7 || subject.length < 3) return null;

  const q = item.area ? `${subject} ${item.area}` : subject;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}&tbm=isch`;
}

/** Source links, deliberately quiet — they are provenance, not content. */
function Sources({
  item,
  small = false,
  bare = false,
}: {
  item: DailyItem;
  small?: boolean;
  /** Drop the top margin when a surrounding row already spaces it. */
  bare?: boolean;
}) {
  const lookup = lookupTarget(item);
  return (
    <div className={`flex flex-wrap gap-1.5 ${bare ? "" : small ? "mt-2" : "mt-4"}`}>
      {item.sources.map((s, j) => (
        <a
          key={j}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-black/20 px-2 py-0.5 text-[11.5px] text-ink-2 transition hover:border-black hover:text-ink"
        >
          {hostOf(s.url)} ↗
        </a>
      ))}
      {lookup && (
        <a
          href={lookup}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-dashed border-black/25 px-2 py-0.5 text-[11.5px] text-ink-2 transition hover:border-black hover:text-ink"
        >
          {/* Say which search it is. "Look it up" on a phrase and on a look
              are different promises, and the seller should know which one
              they are about to open. */}
          {lookup.includes("tbm=isch") ? "See it ↗" : "Who else says it ↗"}
        </a>
      )}
    </div>
  );
}

/** Newest month first, newest day first inside it. */
function groupByMonth(dates: string[]): [string, string[]][] {
  const buckets = new Map<string, string[]>();
  for (const d of [...dates].sort().reverse()) {
    const label = new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const list = buckets.get(label) ?? [];
    list.push(d);
    buckets.set(label, list);
  }
  return [...buckets.entries()];
}

export default function Daily() {
  return (
    <Shell>
      {(world) =>
        /* Open to walk into, closed to work in — see NeedsSetup. */
        needsSetup(world) ? (
          <NeedsSetupPage world={world} what="World News" width="reading" />
        ) : (
          <DailyBody world={world} />
        )
      }
    </Shell>
  );
}

function DailyBody({ world }: { world: World }) {
  const { patch } = useWorld();
  // The issue that is current right now — this week's, filed under its Monday.
  const today = weekStartISO();
  const [deriving, setDeriving] = useState(false);
  /** A fetch is in flight, but the issue already on screen stays up. */
  const [switching, setSwitching] = useState(false);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<DailyItem[] | null>(null);
  /* Everything the same reading found and the paper did not print. */
  const [rest, setRest] = useState<DailyRest[]>([]);
  const [tab, setTab] = useState<"world" | "shops">("world");
  const [dates, setDates] = useState<string[]>([]);
  /* Whether we yet know if this world has a history — see the effect below. */
  const [datesReady, setDatesReady] = useState(false);
  const [writing, setWriting] = useState(false);
  /* Bumped after a run so the shop section re-reads its numbers. */
  const [newsKey, setNewsKey] = useState(0);
  const [err, setErr] = useState("");
  const [nextDrop, setNextDrop] = useState<Drop | null>(null);
  /** Set when what is on screen is an older issue standing in for today's. */
  const [kept, setKept] = useState<Record<string, "saving" | "kept" | "failed">>({});

  // Which board a kept signal lands on: next week's, because that is the one
  // being researched while this week is being built.
  useEffect(() => {
    syncSchedule(world)
      .then((all) => setNextDrop(splitDrops(all).next))
      .catch(() => setNextDrop(null));
  }, [world]);

  async function keep(item: DailyItem) {
    if (!nextDrop || kept[item.id] === "saving" || kept[item.id] === "kept") return;
    setKept((k) => ({ ...k, [item.id]: "saving" }));
    try {
      await saveSignalToBoard(world, nextDrop, {
        headline: item.headline,
        body: item.body,
        url: item.sources[0]?.url ?? null,
      });
      setKept((k) => ({ ...k, [item.id]: "kept" }));
    } catch {
      setKept((k) => ({ ...k, [item.id]: "failed" }));
    }
  }

  /* Back issues are paper only; the shops tab has nothing to show there. */
  const open = useCallback(
    async (d: string) => {
      /*
        THE PAPER ON SCREEN STAYS ON SCREEN.

        This cleared the issue before fetching the next one, so every visit and
        every switch between issues emptied the page first and put it back a
        moment later. On a slow request that is a blank newspaper, which reads
        as "there is nothing this week" rather than "this is loading" — and
        the one thing a newspaper must never do is go blank.

        The previous issue stays up until the next one has actually arrived.
      */
      setSwitching(true);
      setTab("world");
      setDate(d);
      try {
        const [got, more] = await Promise.all([
          loadIssue(world.id, d),
          loadRest(world.id, d).catch(() => []),
        ]);
        setItems(got);
        setRest(more);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load that issue.");
        /* Only empty the page if there was never anything on it. A failed
           refresh must not take away the issue already being read. */
        setItems((current) => current ?? []);
      } finally {
        setSwitching(false);
      }
    },
    [world.id],
  );

  useEffect(() => {
    loadIssueDates(world.id)
      .then(setDates)
      .catch(() => setDates([]))
      .finally(() => setDatesReady(true));
    open(today);
  }, [world.id, today, open]);

  /*
    THE FIRST ISSUE WRITES ITSELF. EVERY ONE AFTER IT IS ASKED FOR.

    A newspaper waiting for you the first time you log in is the promise of
    the product, so that one is bought without anybody pressing anything —
    setup starts it, the schedule backs it up, and this backs up the schedule.

    Buying every following week for every seller was buying two hundred
    newspapers a week and hoping somebody opened them. So from the second
    issue on there is a button, and a world nobody comes back to costs
    nothing. `dates` holds every issue this world has ever had; empty means
    this is still the first one.
  */
  useEffect(() => {
    if (date !== today || items === null || items.length > 0) return;
    if (world.areas.length === 0) return;
    if (!datesReady || dates.length > 0) return;
    startFirstIssue(world.id);
    let alive = true;
    const timer = setInterval(async () => {
      const got = await loadIssue(world.id, today).catch(() => []);
      if (!alive || !got.length) return;
      clearInterval(timer);
      setItems(got);
      setRest(await loadRest(world.id, today).catch(() => []));
      setDates(await loadIssueDates(world.id).catch(() => []));
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [world.id, world.areas.length, date, today, items, datesReady, dates.length]);


  /*
    IS THIS WEEK ALREADY PUBLISHED?

    Asked of the list of issue dates, not of the items currently in state, and
    the difference is the whole point. `items` is one fetch that can come back
    empty for reasons that have nothing to do with the week being unwritten —
    a session still attaching after a sign-in, a dropped request, an RLS read
    racing the token. When that happened the page concluded the week was empty
    and offered to research it again.

    That offer costs real money. The schedule writes issues under a system
    account, so a paper written for the seller overnight does not touch their
    own weekly allowance — which means the button was not merely redundant, it
    would genuinely have spent their one write on a week they had already been
    given, and replaced a paper they may have been reading.

    An issue that exists is a fact about the database. Once this week appears
    in `dates`, nothing on this page offers to write it again until Monday.
  */
  /*
    A NEWER ISSUE IS AN OFFER, NOT AN INTERRUPTION.

    The schedule can write a paper while somebody is reading last week's, and
    replacing what is on screen underneath them is the rudest thing this page
    could do. So the list of issue dates is re-read on a slow timer, and when
    one turns up that is newer than the issue being read, a button appears at
    the top. Nothing moves until it is pressed.
  */
  useEffect(() => {
    const timer = setInterval(() => {
      loadIssueDates(world.id).then(setDates).catch(() => {});
    }, 120_000);
    return () => clearInterval(timer);
  }, [world.id]);

  /*
    A WRITE IN FLIGHT SURVIVES A RELOAD.

    The work happens on the server, so refreshing the page or coming back to
    the tab has nothing to do with whether the issue is coming. This picks the
    watch back up rather than showing the button again and inviting a second
    write over the top of the first.
  */
  useEffect(() => {
    if (!pendingWrite(world.id, today)) return;
    if (items && items.length > 0) { clearWriting(); return; }
    setWriting(true);
    let alive = true;
    const timer = setInterval(async () => {
      const got = await loadIssue(world.id, today).catch(() => [] as DailyItem[]);
      if (!alive || !got.length) return;
      alive = false;
      clearInterval(timer);
      clearWriting();
      setItems(got);
      setRest(await loadRest(world.id, today).catch(() => []));
      setDates(await loadIssueDates(world.id).catch(() => []));
      setWriting(false);
    }, 10_000);
    return () => { alive = false; clearInterval(timer); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [world.id, today]);

  /*
    AN ISSUE THAT EXISTS IS AN ISSUE THAT GETS SHOWN.

    "This week's issue has already been written" over an empty page is the
    worst thing this screen can say: it is both true and useless, and it has
    taken away the button that would have fixed it. It happens whenever the
    issue lands after this page last looked — the overnight job writing it, or
    a request whose research finished after the browser stopped listening.

    The list of dates is polled anyway. If it reports an issue for the week on
    screen and this page is holding nothing, the page was simply looking
    before it existed. Fetch it rather than announcing the problem.
  */
  useEffect(() => {
    if (!dates.includes(date)) return;
    if (items === null || items.length > 0 || switching) return;
    let alive = true;
    loadIssue(world.id, date)
      .then(async (got) => {
        if (!alive || !got.length) return;
        setItems(got);
        setRest(await loadRest(world.id, date).catch(() => []));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [world.id, date, dates, items, switching]);

  /* `dates` is newest first. */
  const newest = dates[0];
  const newerIssue = newest && newest > date ? newest : null;

  const publishedThisWeek = dates.includes(today);
  const loadFailed = publishedThisWeek && items?.length === 0;

  const noAreas = world.areas.length === 0;

  /*
    A WATCH LIST THE SELLER IS NEVER ASKED FOR.

    Setup works this out when onboarding finishes, so the only worlds without
    one are those that skipped it. They used to arrive here to a card headed
    "Nothing being watched yet" offering two buttons: work it out, or go and
    pick them by hand.

    Neither is a decision anybody has the information to make on their first
    visit, and "let your keywords decide" is not a choice, it is the software
    asking permission to do its job. It reads the keywords, which it already
    has, and gets on with it.

    Half a cent, and quiet. If it comes back with nothing the page says so
    once, rather than handing back the same two buttons.
  */
  useEffect(() => {
    if (!noAreas || deriving || world.subNiches.length < 2) return;
    let alive = true;
    setDeriving(true);
    deriveAreas(
      world.id,
      world.name,
      world.subNiches.map((n) => n.keyword),
    )
      .then((areas) => {
        if (!alive) return;
        if (areas.length) patch({ areas });
        else
          setErr(
            "Your keywords did not give enough to watch. You can choose what this world watches in World Profile.",
          );
      })
      .catch(() => {})
      .finally(() => alive && setDeriving(false));
    return () => {
      alive = false;
    };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [noAreas, world.id]);

  /*
    Research happens when it is asked for, and only then.

    This used to fire automatically on the first visit of the day. A paper
    waiting for you is a lovely promise, but it was being bought for every
    seller every morning — five or six live searches and ninety thousand
    tokens of reading each — including the many who would never open it. On a
    button, the same feature costs a fraction and nobody is charged for
    somebody else's unread newspaper.
  */
  return (
    <Page width="reading">
      {/* masthead */}
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world news</span>
          {/*
            THIS USED TO PROMISE SOMETHING NOTHING DELIVERS.

            It read "(next issue drops September 15)" on every issue, always.
            No issue drops. The schedule writes a world's first paper and
            nothing after it; every following week is written when the seller
            presses the button. So the line was telling two hundred people a
            newspaper was coming, and the newspaper was not coming — they would
            arrive on the Monday, find an empty week, and conclude the thing
            was broken. It was not broken; the masthead was lying.

            Now it says what actually happens, and only on the current issue —
            on a back issue from March, what happens next week is not the
            question the reader is asking.
          */}
          <span className="t-small text-ink-3">
            {formatIssueDate(date)}
            {/* The only sign that a fetch is happening. The paper stays put. */}
            {switching && <span className="opacity-60"> · updating</span>}
            {date === today && (
              <span className="opacity-70">
                {" "}
                (write next week&apos;s from {nextIssueDate(date)})
              </span>
            )}
          </span>
        </div>
        {/*
          "Obsessed with" claimed more than the evidence supports — a couple
          of articles is not proof that this customer is obsessed with
          anything. This says what the issue actually is.
        */}
        <h1 className="t-h1 mt-3 text-ink">
          a few things{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            moving through
          </span>{" "}
          your customer&apos;s world today
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {newerIssue && (
        <button
          onClick={() => void open(newerIssue)}
          className="btn btn-primary mb-6 w-full justify-center"
        >
          A newer issue is ready — read {formatIssueDate(newerIssue)}
        </button>
      )}

      {/*
        THE SHOPS ARE A TAB, NOT A TAIL.

        This section used to sit under everything, below the paper and below
        the twelve extras — which meant the two things a seller most wanted
        were at opposite ends of a long scroll, and whichever one they did not
        scroll to did not exist. Neither of them is a footnote to the other.
        One is what the world is saying; the other is what the competition
        actually shipped. They are two halves, so they get two doors.

        Only on the current issue: the shop reading is a comparison between
        this week and last, so it has nothing to say about a date in March.
      */}
      {date === today && !noAreas && (
        <div
          role="tablist"
          aria-label="World news sections"
          className="mb-6 flex gap-1 border-b-2 border-black/12"
        >
          {(
            [
              ["world", "The world"],
              ["shops", "The shops you watch"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="-mb-[2px] border-b-2 px-3 pb-2 pt-1 text-[15px] font-bold transition"
              style={{
                borderColor: tab === id ? "var(--accent)" : "transparent",
                color: tab === id ? "var(--ink)" : "var(--ink-3)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {err && <ErrorNote>{err}</ErrorNote>}


      {noAreas && (
        <Empty
          title="Working out what your world watches"
          body="Reading your keywords. This takes a moment, and then your first issue writes itself."
        />
      )}


      {/*
        Three different empty states, and telling them apart matters.

        A world with no history is having its first issue written right now
        and needs nothing pressed. A world with history is waiting to be
        asked. And an old date that is empty is simply an old date.
      */}
      {/*
        A WORLD WAITING FOR ITS FIRST PAPER IS LOADING, AND SHOULD LOOK IT.

        This state used to be a worded panel: a heading, and a sentence
        explaining that the issue arrives by itself in a minute or two and
        there is nothing to press. Every word of that was the software
        apologising for its own latency. Nobody reads it and decides to relax;
        they read it and wonder what they are supposed to do, which is the
        opposite of what it says.

        A turning globe and a bar say the same thing in no words at all.

        Two ways in and one appearance: the seller who pressed the button, and
        the seller whose first issue is being written by the schedule while
        they sit here. The second waits longer, because the run may have
        started before they opened the page — hence the slower bar.
      */}
      {tab === "world" &&
        items?.length === 0 &&
        !noAreas &&
        (writing || (datesReady && dates.length === 0 && !publishedThisWeek)) && (
          <Card className="mb-16 flex flex-col items-center py-12 text-center">
            <img
              src="/globe.png"
              alt=""
              className="globe-turn h-12 w-12 opacity-80"
            />
            <p className="t-h3 mt-4 text-ink">Reading your world…</p>
            <ReadingBar
              className="mt-4 max-w-xs"
              expect={writing ? 300 : 150}
            />
            {/* The write runs on the server and is saved there, so this is
                genuinely true and worth saying: nobody has to sit here. */}
            {writing && (
              <p className="t-small mt-4 max-w-sm text-ink-3">
                This takes a few minutes. You can close this page — the issue
                is written and saved either way, and it will be here when you
                come back.
              </p>
            )}
          </Card>
        )}

      {/*
        This week is published but the fetch came back empty, so this is a
        load that failed rather than a week that is quiet. Say so, and offer
        the one action that can help — reading it again, which costs nothing.
      */}
      {tab === "world" && loadFailed && !writing && (
        <Card className="mb-16 flex flex-col items-center py-12 text-center">
          <p className="t-h3 text-ink">This week&apos;s issue did not load</p>
          <p className="t-small mt-2 max-w-[46ch] text-ink-2">
            It is written and saved — this was the reading of it that failed.
            Nothing has been lost and nothing will be researched again.
          </p>
          <button onClick={() => open(today)} className="btn btn-accent mt-5">
            Try again
          </button>
        </Card>
      )}

      {tab === "world" &&
        items?.length === 0 &&
        !noAreas &&
        !writing &&
        !loadFailed &&
        !(datesReady && dates.length === 0) && (
        <Empty
          title={
            date !== today
              ? "No issue on that date"
              : "This week's issue is ready to be written"
          }
          body={
            date !== today
              ? "Pick another date from the back issues below."
              : "Each issue is researched fresh when you ask for it, so it is genuinely this week's rather than something written in advance and left to go stale."
          }
          action={
            date === today && dates.length > 0 && !publishedThisWeek ? (
              <button
                disabled={writing}
                onClick={async () => {
                  if (writing) return;
                  setWriting(true);
                  setErr("");
                  try {
                    /*
                      Shops first, so the numbers under the paper are from the
                      same moment as the paper. It is quick and it cannot fail
                      the issue.
                    */
                    await sweepShops(world.id);
                    /*
                      AND THEN NOBODY WAITS. The route writes the paper itself,
                      so the request is an acknowledgement rather than the
                      delivery. This starts it and watches the database, which
                      is where the answer actually arrives. Closing the tab
                      costs nothing.
                    */
                    startWrite(world, today, async (got) => {
                      setItems(got);
                      setRest(await loadRest(world.id, today).catch(() => []));
                      setDates(await loadIssueDates(world.id).catch(() => dates));
                      setNewsKey((n) => n + 1);
                      setWriting(false);
                      setErr("");
                    });
                    return;
                  } catch (e) {
                    /*
                      BEFORE REPORTING A FAILURE, CHECK WHETHER IT FAILED.

                      The research runs on the server and is written there. A
                      browser that loses the connection, times out, or is left
                      for a moment on a sleeping laptop learns nothing about
                      whether the work finished — and this used to take that
                      silence as proof of failure, tell the seller it had not
                      worked, and leave a finished issue sitting in the
                      database unread.

                      So look. If the paper is there, it worked, whatever the
                      request did.
                    */
                    const landed = await loadIssue(world.id, today).catch(
                      () => [] as DailyItem[],
                    );
                    if (landed.length) {
                      setItems(landed);
                      setRest(await loadRest(world.id, today).catch(() => []));
                      setDates(await loadIssueDates(world.id).catch(() => dates));
                      setNewsKey((n) => n + 1);
                      setErr("");
                    } else {
                      setErr(
                        e instanceof Error
                          ? e.message
                          : "That did not finish. Nothing was used up; try again.",
                      );
                    }
                    /* Only here. The success path is still waiting on the
                       watcher, and a `finally` would have cancelled the wait
                       the instant it began. */
                    clearWriting();
                    setWriting(false);
                  }
                }}
                className="btn btn-accent"
              >
                Write this week&apos;s issue
              </button>
            ) : undefined
          }
        />
      )}

      {tab === "world" && items && items.length > 0 && (() => {
        /*
          Five equally large cards read as a research dump and take ten
          minutes. A paper has a front page: one lead with room to breathe,
          the rest short, and anything that is literally customer language
          pulled out at the end because that is the most directly useful
          thing on the page for someone who prints words on clothes.
        */
        const [lead, ...others] = items;
        const language = others.find((i) => i.kind === "phrase");
        const quick = others.filter((i) => i !== language);

        return (
          <>
            <Card className="rise" hover pad={false}>
              <div className="flex items-center justify-between px-5 pt-4 md:px-6">
                <Dots />
              </div>
              <div className="px-5 pb-5 pt-4 md:px-6">
                <h2 className="t-h2 text-ink">{lead.headline}</h2>
                <p className="t-body mt-2 text-ink-2">{lead.body}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <Sources item={lead} bare />
                  <KeepIt
                    item={lead}
                    drop={nextDrop}
                    onKeep={keep}
                    state={kept[lead.id] ?? "idle"}
                  />
                </div>
              </div>
            </Card>

            {quick.length > 0 && (
              <section className="mt-6">
                {/* No heading. They are stories, in order; that is enough. */}
                <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/15 bg-white">
                  {quick.map((it, i) => (
                    <article key={it.id} className="flex gap-3.5 px-4 py-3.5">
                      <span className="numeral shrink-0 text-[1.15rem]">
                        {String(i + 2).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <h3 className="t-h3 text-ink">{it.headline}</h3>
                        <p className="t-small mt-0.5 text-ink-2">{it.body}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <Sources item={it} small bare />
                          <KeepIt
                            item={it}
                            drop={nextDrop}
                            onKeep={keep}
                            state={kept[it.id] ?? "idle"}
                          />
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {language && (
              <section className="mt-6">
                <p className="eyebrow mb-3 text-ink-3">Language in the wild</p>
                <Card className="p-5">
                  <h3 className="t-h2 text-ink">{language.headline}</h3>
                  <p className="t-body mt-2 text-ink-2">{language.body}</p>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <Sources item={language} bare />
                    <KeepIt
                      item={language}
                      drop={nextDrop}
                      onKeep={keep}
                      state={kept[language.id] ?? "idle"}
                    />
                  </div>
                </Card>
              </section>
            )}

            {/*
              EVERYTHING ELSE THE READING FOUND.

              The scout turns up forty things and the paper prints five. These
              are the other thirty-five, kept rather than binned — which is
              what World Web was built for, at the price of a second research
              run every week. Same reading, same evidence rule, no extra cost.

              Shut by default. It is a pile, and a pile belongs behind a door.
            */}
            {rest.length > 0 && (
              <section className="mt-8 border-t-2 border-black/10 pt-5">
                {/*
                  This arrived as a grey line above the footer and was
                  invisible — the page looked unchanged to somebody who had
                  just paid for a research run. It is a section now, with the
                  same eyebrow every other section on this page has, a real
                  heading and a line saying what it is.
                */}
                {/*
                  These were behind a heading calling them "everything else it
                  found", under a paragraph explaining that they had not made
                  the paper. That framing told the reader the next twelve
                  stories were the offcuts, before they had read one — and it
                  was there to explain the software's sorting, which is not
                  something a reader needs to know about.

                  They are stories. Publish them.
                */}
                {/*
                  NOT BEHIND A DOOR ANY MORE.

                  This was a collapsed toggle, shut by default, and the pile
                  behind it turned out to be some of the best material on the
                  page — the hawk worry, the things people argue about. A
                  reader who never presses the arrow never learns that, and
                  most readers never press the arrow.

                  So it is printed, with the same quiet eyebrow every other
                  section here has. Not a heading announcing a second-class
                  pile: just more of the paper.
                */}
                <p className="eyebrow mb-4 text-ink-3">More this week</p>

                <ul className="space-y-4">
                    {rest.map((r) => (
                      <li
                        key={r.id}
                        className="border-l-2 border-black/12 pl-4"
                      >
                        <p className="text-[15px] font-bold text-ink">
                          {r.label}
                        </p>
                        {r.note && (
                          <p className="t-small mt-0.5 text-ink-2">{r.note}</p>
                        )}
                        <blockquote className="mt-1.5 text-[14px] italic leading-relaxed text-ink-2">
                          &ldquo;{r.quote}&rdquo;
                        </blockquote>
                        <div className="t-small mt-1.5 flex flex-wrap items-center gap-x-4 text-ink-3">
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="transition hover:text-ink"
                          >
                            {hostOf(r.url)} ↗
                          </a>
                          {nextDrop && (
                            <button
                              onClick={async () => {
                                await saveSignalToBoard(world, nextDrop, {
                                  headline: r.label,
                                  body: `${r.note ?? ""}\n\n“${r.quote}”`.trim(),
                                  url: r.url,
                                });
                                setRest((all) =>
                                  all.filter((x) => x.id !== r.id),
                                );
                              }}
                              className="transition hover:text-ink"
                            >
                              Save to my board
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              await hideRest(r.id);
                              setRest((all) => all.filter((x) => x.id !== r.id));
                            }}
                            className="transition hover:text-ink"
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
              </section>
            )}

            {/*
              No footer.

              What stood here was the tool talking about itself — that this is
              not sales data, that it is written once a week. Both were true
              and neither was the reader's problem: a newspaper does not end
              with a note explaining what kind of newspaper it is.
            */}
          </>
        );
      })()}

      {/*
        Shown whether or not the seller follows anybody — when it is empty it
        is the thing that explains what following shops would give them.
      */}
      {date === today && tab === "shops" && (
        <ShopNews key={newsKey} worldId={world.id} />
      )}

      {dates.length > 1 && (
        <div className="mt-8 border-t border-black/12 pt-5">
          <p className="eyebrow mb-3 text-ink-3">Back issues</p>
          {/*
            An ever-growing single row of dates stops being navigable after a
            few weeks. Grouped by month, the newest first, it stays readable
            for as long as the world does.
          */}
          <div className="space-y-4">
            {groupByMonth(dates).map(([month, days]) => (
              <div key={month}>
                <p className="t-small mb-1.5 font-semibold text-ink-2">
                  {month}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {days.map((d) => (
                    <button
                      key={d}
                      onClick={() => open(d)}
                      className={`chip tabular-nums transition ${
                        d === date
                          ? "border-black bg-black text-white"
                          : "hover:border-ink-3"
                      }`}
                      title={formatIssueDate(d)}
                    >
                      {Number(d.slice(8, 10))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </Page>
  );
}
