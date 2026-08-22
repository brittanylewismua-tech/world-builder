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
  loadDrops,
  STATUS_LABEL,
  type Drop,
} from "@/lib/drops";
import type { World } from "@/lib/world";

/**
 * HOME
 *
 * Where the seller lands. Not a dashboard and not a to-do list — it answers
 * one question, "where am I in this world today", and then gets out of the way
 * by handing them the door they actually wanted.
 *
 * SPEC guards this closely: no scoring, no verdicts, no "you should make…".
 * The drop card counts slots because the seller filled them. The daily card
 * shows headlines because they were already researched. Nothing here is an
 * opinion about the work.
 */
export default function HomePage() {
  return <Shell>{(world) => <HomeBody world={world} />}</Shell>;
}

function HomeBody({ world }: { world: World }) {
  const today = todayISO();
  const [items, setItems] = useState<DailyItem[] | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);

  useEffect(() => {
    loadIssue(world.id, today)
      .then(setItems)
      .catch(() => setItems([]));
    loadDrops(world.id)
      .then((d) => setDrop(d.find((x) => !x.frozenAt) ?? d[0] ?? null))
      .catch(() => setDrop(null));
  }, [world.id, today]);

  const filled = drop?.items.length ?? 0;
  const slots = world.slotsPerDrop;
  const pct = slots ? (filled / slots) * 100 : 0;

  return (
    <Page width="wide">
      <header className="mb-8">
        <span className="t-small text-ink-3">{formatIssueDate(today)}</span>
        <h1 className="t-h1 mt-2 text-ink">
          {greeting().toLowerCase()} — you&apos;re in{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            {world.name.toLowerCase()}
          </span>
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ------------------------------------------------ the drop */}
        <Card className="lg:col-span-3" pad={false} dots hover>
          <div className="p-5 md:p-6">
            <span className="eyebrow text-ink-3">the drop you&apos;re building</span>

            {drop ? (
              <>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-[2rem] font-extrabold leading-none tracking-tight">
                    Drop {String(drop.number).padStart(2, "0")}
                  </span>
                  <span className="t-small text-ink-2">
                    publishes {formatDropDate(drop.publishDate)}
                  </span>
                  <span className="chip chip-accent ml-auto">
                    {STATUS_LABEL[drop.status]}
                  </span>
                </div>

                <div className="mt-5 flex items-end gap-4">
                  <span className="numeral text-[3.2rem]">
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

                <Link href="/studio" className="btn btn-primary mt-6">
                  Open the board
                </Link>
              </>
            ) : (
              <>
                <p className="t-body mt-2 text-ink-2">
                  Your first board is waiting to be opened.
                </p>
                <Link href="/studio" className="btn btn-primary mt-5">
                  Open Drop Studio
                </Link>
              </>
            )}
          </div>
        </Card>

        {/* ------------------------------------------------ today's daily */}
        <Card className="lg:col-span-2" pad={false} hover>
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2">
              <Star size={10} className="text-accent" />
              <span className="eyebrow text-ink-3">in your world today</span>
            </div>

            {items === null ? (
              <p className="t-small mt-4 text-ink-3">Checking…</p>
            ) : items.length === 0 ? (
              <>
                <p className="t-body mt-3 text-ink-2">
                  Today&apos;s issue hasn&apos;t been read yet. It gets written
                  on your first visit to World Daily.
                </p>
                <Link href="/daily" className="btn btn-accent mt-5">
                  Read today
                </Link>
              </>
            ) : (
              <>
                <ul className="mt-4 space-y-3.5">
                  {items.slice(0, 3).map((it, i) => (
                    <li key={it.id} className="flex gap-3">
                      <span className="numeral shrink-0 text-[1.15rem]">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="t-small font-semibold leading-snug text-ink">
                        {it.headline}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/daily"
                  className="t-small mt-5 inline-block font-semibold underline underline-offset-4 hover:opacity-70"
                >
                  All {items.length} today →
                </Link>
              </>
            )}
          </div>
        </Card>
      </div>

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
