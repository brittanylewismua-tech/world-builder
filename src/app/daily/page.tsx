/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote, Dots } from "@/components/ui";
import {
  formatIssueDate,
  generateIssue,
  hostOf,
  loadIssue,
  loadIssueDates,
  weekStartISO,
  type DailyItem,
} from "@/lib/daily";
import { deriveAreas } from "@/lib/api";
import { saveSignalToBoard } from "@/lib/board";
import { splitDrops, syncSchedule, type Drop } from "@/lib/drops";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/world";
import { report } from "@/lib/report";
import { LimitReached } from "@/lib/askAI";
import ReadingBar from "@/components/ReadingBar";

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
 * WHAT TO SEARCH FOR, WHEN YOU WANT MORE THAN THE PARAGRAPH.
 *
 * Citations are now held to a hard standard — a real page, not a homepage or
 * a hashtag index — which is right, and means some items ship with one link
 * or none. That is honest but it leaves the seller at a dead end on exactly
 * the items they most want to pull on.
 *
 * A headline in this paper is usually the thing itself: the phrase, in
 * quotes, because the exact wording is the point. So the quoted part is the
 * search, and everything else falls back to the headline.
 */
function lookupQuery(item: DailyItem) {
  // Straight quotes and curly ones — the model writes both.
  const quoted = item.headline.match(/["“]([^"”]{2,80})["”]/);
  if (quoted) return `"${quoted[1]}"`;
  return item.headline.replace(/[.,;:]+$/, "");
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
      <a
        href={`https://www.google.com/search?q=${encodeURIComponent(lookupQuery(item))}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-md border border-dashed border-black/25 px-2 py-0.5 text-[11.5px] text-ink-2 transition hover:border-black hover:text-ink"
      >
        Look it up ↗
      </a>
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
  return <Shell>{(world) => <DailyBody world={world} />}</Shell>;
}

function DailyBody({ world }: { world: World }) {
  const { patch } = useWorld();
  // The issue that is current right now — this week's, filed under its Monday.
  const today = weekStartISO();
  const [deriving, setDeriving] = useState(false);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<DailyItem[] | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [researching, setResearching] = useState(false);
  const [err, setErr] = useState("");
  const [nextDrop, setNextDrop] = useState<Drop | null>(null);
  /** Set when what is on screen is an older issue standing in for today's. */
  const [standIn, setStandIn] = useState<string | null>(null);
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

  const open = useCallback(
    async (d: string) => {
      setItems(null);
      setStandIn(null);
      setDate(d);
      try {
        setItems(await loadIssue(world.id, d));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not load that issue.");
        setItems([]);
      }
    },
    [world.id],
  );

  useEffect(() => {
    loadIssueDates(world.id)
      .then(setDates)
      .catch(() => setDates([]));
    open(today);
  }, [world.id, today, open]);

  const research = useCallback(
    async (append = false) => {
      setResearching(true);
      setErr("");
      setStandIn(null);
      try {
        setItems(await generateIssue(world, date, { append }));
        setDates(await loadIssueDates(world.id));
      } catch (e) {
        /*
          A limit is not a failure. Say it plainly and leave the page alone —
          no error report, and no hunting for an older issue to stand in,
          because nothing went wrong with the issue that is already here.
        */
        if (e instanceof LimitReached) {
          setErr(e.message);
          setResearching(false);
          return;
        }
        report("daily", e, { worldId: world.id, date, append });
        setErr(e instanceof Error ? e.message : "Research failed.");
        /*
          A failed search used to leave the seller with a blank page, which
          reads as the product being broken. Yesterday's paper is still real
          and still useful — show it, clearly labelled as not today's, rather
          than showing nothing.
        */
        try {
          const back = (await loadIssueDates(world.id)).filter((d) => d !== date);
          if (back.length) {
            const fallbackDate = back[0];
            const older = await loadIssue(world.id, fallbackDate);
            if (older.length) {
              setItems(older);
              setStandIn(fallbackDate);
            }
          }
        } catch {
          // Nothing to fall back to; the empty state explains itself.
        }
      } finally {
        setResearching(false);
      }
    },
    [world, date],
  );

  const noAreas = world.areas.length === 0;

  /** Fallback for a world whose watch list never got worked out. */
  async function deriveNow() {
    setDeriving(true);
    const areas = await deriveAreas(
      world.id,
      world.name,
      world.subNiches.map((n) => n.keyword),
    );
    setDeriving(false);
    if (areas.length) {
      patch({ areas });
    } else {
      setErr(
        "I could not work out a watch list from those keywords. You can pick them yourself in World Profile.",
      );
    }
  }

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
          <span className="t-small text-ink-3">{formatIssueDate(date)}</span>
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

      {err && <ErrorNote>{err}</ErrorNote>}

      {standIn && (
        <div className="mb-5 rounded-xl border border-black/15 bg-white px-4 py-3">
          <p className="t-small text-ink-2">
            Showing{" "}
            <span className="font-semibold text-ink">
              {formatIssueDate(standIn)}
            </span>
            .{" "}
            <button
              onClick={() => research()}
              className="font-semibold text-ink underline underline-offset-2"
            >
              Try this week again
            </button>
          </p>
        </div>
      )}

      {noAreas && (
        <Empty
          title="Nothing being watched yet"
          body="Pick what this world watches, or let your keywords decide."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={deriveNow}
                disabled={deriving || world.subNiches.length < 2}
                className="btn btn-accent"
              >
                {deriving ? "Reading your keywords…" : "Work out what to watch"}
              </button>
              <Link href="/profile" className="btn btn-ghost">
                Choose them myself
              </Link>
            </div>
          }
        />
      )}

      {researching && (
        <Card className="flex flex-col items-center py-14 text-center">
          <img src="/globe.png" alt="" className="globe-turn h-14 w-14 opacity-80" />
          <p className="t-h3 mt-5 text-ink">Reading your world…</p>
          <ReadingBar className="mt-4 max-w-xs" />
          {/*
            How long, and nothing else. The old line walked the seller through
            the machinery — how many areas were being searched, what was being
            discarded — which is both none of their business and quietly
            damaging: describing the work as "searching a few places" invites
            them to think they could just do that themselves.
          */}
          <p className="t-small mt-1.5 text-ink-3">About a minute.</p>
        </Card>
      )}

      {!researching && items?.length === 0 && !noAreas && (
        <Empty
          title={
            date === today ? "Ready when you are" : "No issue on that date"
          }
          /*
            What they get, not how it is made. The previous version described
            the pipeline — how many areas, what gets discarded, how long it
            takes — which reads as a tool explaining its own effort rather
            than a paper worth opening.
          */
          body={
            date === today
              ? "Today's issue hasn't been written yet."
              : "Pick another date from the back issues below."
          }
          action={
            date === today ? (
              <button onClick={() => research()} className="btn btn-accent">
                Read my world today
              </button>
            ) : undefined
          }
        />
      )}

      {!researching && items && items.length > 0 && (() => {
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
                <p className="eyebrow mb-3 text-ink-3">Also moving</p>
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
              A footer, not an essay.

              This was four sentences of the tool explaining its own epistemics
              — what it is not, what it dropped, who decides. One line carries
              the only part a reader needs, which is that none of this is sales
              data. The button says what it does and the note under it says
              when it is worth pressing.
            */}
            <div className="mt-6 border-t border-black/10 pt-4">
              <p className="t-small text-ink-3">Not sales or demand data.</p>
              {date === today && (
                <div className="mt-3">
                  <button
                    onClick={() => research(true)}
                    className="btn btn-ghost"
                  >
                    Refresh
                  </button>
                  <p className="t-small mt-1.5 text-ink-3">
                    Updates every two to three days.
                  </p>
                </div>
              )}
            </div>
          </>
        );
      })()}

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
