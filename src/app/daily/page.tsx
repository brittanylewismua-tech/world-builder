/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote, Dots } from "@/components/ui";
import {
  formatIssueDate,
  generateIssue,
  greeting,
  hostOf,
  loadIssue,
  loadIssueDates,
  todayISO,
  type DailyItem,
} from "@/lib/daily";
import type { World } from "@/lib/world";

export default function Daily() {
  return <Shell>{(world) => <DailyBody world={world} />}</Shell>;
}

function DailyBody({ world }: { world: World }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<DailyItem[] | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [researching, setResearching] = useState(false);
  const [err, setErr] = useState("");
  const autoRan = useRef(false);

  const open = useCallback(
    async (d: string) => {
      setItems(null);
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

  const research = useCallback(async () => {
    setResearching(true);
    setErr("");
    try {
      setItems(await generateIssue(world, date));
      setDates(await loadIssueDates(world.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Research failed.");
    } finally {
      setResearching(false);
    }
  }, [world, date]);

  const noAreas = world.areas.length === 0;

  // SPEC: the paper should be waiting each morning, not requested.
  useEffect(() => {
    if (autoRan.current || noAreas || researching) return;
    if (date !== today) return;
    if (items === null || items.length > 0) return;
    autoRan.current = true;
    research();
  }, [items, noAreas, researching, date, today, research]);

  return (
    <Page width="reading">
      {/* masthead */}
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world daily</span>
          <span className="t-small text-ink-3">{formatIssueDate(date)}</span>
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          {greeting().toLowerCase()} — here&apos;s what your customer is{" "}
          <span className="italic" style={{ color: "var(--accent-ink)" }}>
            obsessed with
          </span>{" "}
          today
        </h1>
        <span className="rule-accent mt-4" />
        {!noAreas && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {world.areas.map((a) => (
              <span key={a.id} className="chip">
                {a.name}
              </span>
            ))}
          </div>
        )}
      </header>

      {err && <ErrorNote>{err}</ErrorNote>}

      {noAreas && (
        <Empty
          title="No areas to watch yet"
          body="World Daily reads the parts of your customer's world that you choose — not what an AI thinks matters."
          action={
            <Link href="/profile" className="btn btn-accent">
              Add world areas
            </Link>
          }
        />
      )}

      {researching && (
        <Card className="flex flex-col items-center py-14 text-center">
          <img src="/globe.png" alt="" className="globe-turn h-14 w-14 opacity-80" />
          <p className="t-h3 mt-5 text-ink">Reading your world…</p>
          <p className="t-small mx-auto mt-1.5 max-w-sm text-ink-2">
            Searching {world.areas.length} area
            {world.areas.length === 1 ? "" : "s"}, then throwing out everything
            that is not genuinely current. This takes a minute.
          </p>
        </Card>
      )}

      {!researching && items?.length === 0 && !noAreas && (
        <Empty
          title={
            date === today
              ? "Nothing published yet today"
              : "No issue on that date"
          }
          body={
            date === today
              ? "Research runs automatically on your first visit each day. You can also run it now."
              : "Pick another date from the back issues below."
          }
          action={
            date === today ? (
              <button onClick={research} className="btn btn-accent">
                Research today
              </button>
            ) : undefined
          }
        />
      )}

      {!researching && items && items.length > 0 && (
        <>
          <div className="space-y-4">
            {items.map((it, i) => (
              <Card key={it.id} className="rise" hover pad={false}>
                <div className="flex items-center justify-between px-5 pt-4 md:px-6">
                  <Dots />
                  <span className="chip chip-solid">{it.area}</span>
                </div>
                <div className="flex gap-4 px-5 pb-5 pt-4 md:px-6">
                  <span className="numeral shrink-0 text-[2.4rem]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                <h2 className="t-h2 text-ink">{it.headline}</h2>
                <p className="t-body mt-2 text-ink-2">{it.body}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {it.sources.map((s, j) => (
                    <a
                      key={j}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chip chip-solid transition hover:opacity-80"
                    >
                      {hostOf(s.url)} ↗
                    </a>
                  ))}
                </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <p className="t-small mt-5 text-ink-3">
            Signals only. Nothing here is a product instruction and none of it is
            sales data — what any of it means for your shop is your call. Every
            link came back from a real search; anything unverifiable was dropped.
            {date === today && (
              <>
                {" "}
                <button
                  onClick={research}
                  className="font-medium text-ink-2 underline underline-offset-2 transition hover:text-ink"
                >
                  Re-research today
                </button>
              </>
            )}
          </p>
        </>
      )}

      {dates.length > 1 && (
        <div className="mt-8 border-t border-black/12 pt-5">
          <p className="eyebrow mb-3 text-ink-3">Back issues</p>
          <div className="flex flex-wrap gap-1.5">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => open(d)}
                className={`chip transition ${
                  d === date
                    ? "border-black bg-black text-white"
                    : "hover:border-ink-3"
                }`}
              >
                {formatIssueDate(d)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Page>
  );
}
