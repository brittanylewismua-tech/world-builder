"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Page, Card, Dots, Star } from "@/components/ui";
import {
  formatIssueDate,
  greeting,
  loadIssue,
  todayISO,
  type DailyItem,
} from "@/lib/daily";
import {
  formatDropDate,
  splitDrops,
  syncSchedule,
  STATUS_LABEL,
  type Drop,
} from "@/lib/drops";
import { boardGlance } from "@/lib/board";
import SecureWorld from "@/components/SecureWorld";
import type { World } from "@/lib/world";

/**
 * HOME
 *
 * Where the seller lands. Not a dashboard and not a to-do list — it answers
 * one question, "where am I in this world today", and then gets out of the way
 * by handing them the door they actually wanted.
 *
 * THE RHYTHM IS THE POINT. Two things are always true at once in this method:
 * one drop is being built, and the next one is being researched. Home used to
 * show only the first, which quietly taught the seller that research is
 * something you do when you remember to. The two cards sit side by side, same
 * size, same weight, because they are the same week.
 *
 * SPEC guards this closely: no scoring, no verdicts, no "you should make…".
 * The drop card counts slots because the seller filled them. The daily strip
 * shows a headline because it was already researched. Nothing here is an
 * opinion about the work.
 */
export default function HomePage() {
  return <Shell>{(world) => <HomeBody world={world} />}</Shell>;
}

function HomeBody({ world }: { world: World }) {
  const today = todayISO();
  const [items, setItems] = useState<DailyItem[] | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [next, setNext] = useState<Drop | null>(null);
  const [glance, setGlance] = useState<{ items: number; findings: number }>({
    items: 0,
    findings: 0,
  });

  /*
    NOTHING IS RESEARCHED UNLESS SOMEBODY ASKS.

    Landing here used to quietly start a full research run — five or six live
    web searches and around ninety thousand tokens of reading, about thirty-
    seven cents, every day, for every seller, whether they ever opened the
    paper or not. Most of that was spent on people who were not going to read
    it, which is a strange thing to buy on their behalf.

    World News is now something you press. This page only shows what has
    already been written.
  */
  useEffect(() => {
    loadIssue(world.id, today)
      .then(setItems)
      .catch(() => setItems([]));
    // Same call Drop Studio makes, so the board exists the moment the world
    // does and Home is never the only screen that thinks there is no drop.
    syncSchedule(world)
      .then(async (all) => {
        const { current, next } = splitDrops(all);
        setDrop(current);
        setNext(next);
        if (next) setGlance(await boardGlance(next.id));
      })
      .catch(() => setDrop(null));
  }, [world, today]);

  const filled = drop?.items.length ?? 0;
  const slots = world.slotsPerDrop;
  const pct = slots ? (filled / slots) * 100 : 0;

  return (
    <Page width="wide">
      <SecureWorld />

      <header className="mb-8">
        <span className="t-small text-ink-3">{formatIssueDate(today)}</span>
        <h1 className="t-h1 mt-2 text-ink">{greeting().toLowerCase()}</h1>
        <span className="rule-accent mt-4" />
      </header>

      {/* --------------------------------------------- the week's two halves */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------- building now */}
        <Card pad={false} dots hover>
          <div className="flex h-full flex-col p-5 md:p-6">
            <span className="eyebrow text-ink-3">building now</span>

            {drop ? (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[1.9rem] font-extrabold leading-none tracking-tight">
                    Drop {String(drop.number).padStart(2, "0")}
                  </span>
                  <span className="chip chip-accent ml-auto">
                    {STATUS_LABEL[drop.status]}
                  </span>
                </div>
                <span className="t-small mt-1.5 text-ink-2">
                  publishes {formatDropDate(drop.publishDate)}
                </span>

                <div className="mt-5 flex items-end gap-4">
                  <span className="numeral text-[2.9rem]">
                    {String(filled).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex items-baseline justify-between">
                      <span className="t-small font-semibold">
                        {filled} of {slots} designs uploaded
                      </span>
                      <span className="t-small tabular-nums text-ink-3">
                        {slots - filled} empty
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/8">
                      <div
                        className="h-full rounded-full bg-accent transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* the board at a glance */}
                <div className="mt-5 flex gap-1.5 overflow-hidden">
                  {Array.from({ length: slots }, (_, i) => {
                    const item = drop.items.find((x) => x.slot === i + 1);
                    return item ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={item.src}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-md border border-black/12 object-cover"
                      />
                    ) : (
                      <div
                        key={i}
                        className="h-12 w-12 shrink-0 rounded-md border border-dashed border-black/20"
                      />
                    );
                  })}
                </div>

                <div className="mt-auto pt-6">
                  <Link href="/studio" className="btn btn-primary">
                    Open the board
                  </Link>
                </div>
              </>
            ) : (
              <>
                {/*
                  Both boards are created the moment a world exists, so
                  reaching this means something went wrong on the way in.
                  One card carries the action; the other explains.
                */}
                <p className="t-body mt-2 text-ink-2">
                  Your first board has not opened yet. It is created for you,
                  so this usually just means the connection dropped.
                </p>
                <div className="mt-auto pt-6">
                  <Link href="/studio" className="btn btn-primary">
                    Open Drop Studio
                  </Link>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* ------------------------------------------------ researching next */}
        <Card pad={false} dots hover>
          <div className="flex h-full flex-col p-5 md:p-6">
            <span className="eyebrow text-ink-3">researching next</span>

            {next ? (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[1.9rem] font-extrabold leading-none tracking-tight">
                    Drop {String(next.number).padStart(2, "0")}
                  </span>
                  <span className="chip ml-auto">not started yet</span>
                </div>
                <span className="t-small mt-1.5 text-ink-2">
                  publishes {formatDropDate(next.publishDate)}
                </span>

                <div className="mt-5 flex items-end gap-4">
                  <span className="numeral text-[2.9rem]">
                    {String(glance.items).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 pb-2">
                    <p className="t-small font-semibold">
                      {glance.items === 0
                        ? "nothing collected yet"
                        : `${glance.items} thing${glance.items === 1 ? "" : "s"} collected`}
                    </p>
                    <p className="t-small mt-0.5 text-ink-3">
                      {glance.findings > 0
                        ? `${glance.findings} pattern${glance.findings === 1 ? "" : "s"} waiting to be read`
                        : "Save what you notice this week — designs, phrases, photographs, links."}
                    </p>
                  </div>
                </div>

                <p className="t-small mt-5 text-ink-3">
                  Research runs a week ahead of building. What lands here now is
                  what you will have to work from when this drop comes round.
                </p>

                <div className="mt-auto pt-6">
                  <Link href="/studio?tab=research" className="btn btn-accent">
                    {glance.items === 0
                      ? "Start collecting"
                      : "Open the research board"}
                  </Link>
                </div>
              </>
            ) : (
              <>
                <p className="t-body mt-2 text-ink-2">
                  Every week you build one drop and research the next at the
                  same time. This side is next week — it opens alongside your
                  first board.
                </p>
                <p className="t-small mt-3 text-ink-3">
                  Nothing to do here yet.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ----------------------------------------- today's paper, compressed */}
      <Card className="mt-4" pad={false} hover>
        <Link href="/daily" className="block p-5 md:p-6">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="flex items-center gap-2">
              <Star size={10} className="text-accent" />
              <span className="eyebrow text-ink-3">in your world today</span>
            </span>
            {items !== null && items.length > 0 && (
              <span className="t-small ml-auto font-semibold underline underline-offset-4">
                Read all {items.length} →
              </span>
            )}
          </div>

          {items === null ? (
            <p className="t-small mt-3 text-ink-3">Checking…</p>
          ) : items.length === 0 ? (
            <p className="t-body mt-2 text-ink-2">
              Nothing read yet today. Open World News and press the button
              when you want to know what is moving in your customer&apos;s
              world.
            </p>
          ) : (
            <>
              <p className="t-h3 mt-2.5 text-ink">{items[0].headline}</p>
              {items.length > 1 && (
                <p className="t-small mt-1.5 text-ink-3">
                  {items
                    .slice(1, 4)
                    .map((i) => i.headline)
                    .join(" · ")}
                </p>
              )}
            </>
          )}
        </Link>
      </Card>

      {/* ------------------------------------------------ the other rooms */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Door
          href="/customer"
          title="Talk to the customer"
          line="Ask her a normal question and think from inside her week."
        />
        <Door
          href="/history"
          title="Drop history"
          line="Every drop you have released, frozen as you released it."
        />
        <Door
          href="/profile"
          title="World profile"
          line="Sub-niches, references, what gets watched, and how this place looks."
        />
      </div>

      <p className="t-small mt-8 text-ink-3">
        Nothing on this page is a judgment about your work — it is a count of
        what you have made and what you have read. What any of it means is
        yours to decide.
      </p>
    </Page>
  );
}

function Door({
  href,
  title,
  line,
}: {
  href: string;
  title: string;
  line: string;
}) {
  return (
    <Link href={href} className="card card-hover block p-5">
      <div className="flex items-center justify-between">
        <Dots />
        <span className="text-ink-3">→</span>
      </div>
      <p className="t-h3 mt-4 text-ink">{title}</p>
      <p className="t-small mt-1 text-ink-2">{line}</p>
    </Link>
  );
}
