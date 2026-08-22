"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { Globe, Sparkle } from "@/components/Globe";
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
    loadIssueDates(world.id).then(setDates).catch(() => setDates([]));
    open(today);
  }, [world.id, today, open]);

  async function research() {
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
  }

  const noAreas = world.areas.length === 0;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      {/* masthead */}
      <div className="border-b-2 border-pink pb-5">
        <div className="flex items-center gap-2 text-pink">
          <Sparkle size={11} />
          <span className="eyebrow">World Daily</span>
          <span className="ml-auto eyebrow text-smoke">
            {formatIssueDate(date)}
          </span>
        </div>
        <h1 className="display mt-4 text-[clamp(1.8rem,5vw,3rem)] text-paper">
          {greeting()}
        </h1>
        <p className="display mt-1 text-[clamp(1rem,2.6vw,1.4rem)] text-pink">
          Here&apos;s what&apos;s happening in your world
        </p>
        <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-xs text-smoke">
          {world.areas.map((a) => (
            <span key={a.id}>{a.name}</span>
          ))}
        </p>
      </div>

      {err && (
        <p className="mt-6 border-l-2 border-pink bg-pink/10 px-4 py-3 text-sm leading-relaxed text-paper">
          {err}
        </p>
      )}

      {noAreas && (
        <div className="mt-10">
          <p className="text-[15px] leading-relaxed text-paper/85">
            You have not named any areas to watch yet. World Daily reads the
            parts of your customer&apos;s world that you choose — not what an AI
            thinks matters.
          </p>
          <Link
            href="/profile"
            className="display mt-5 inline-block bg-pink px-6 py-3 text-lg text-black hover:bg-pink-hot"
          >
            Add world areas
          </Link>
        </div>
      )}

      {/* researching */}
      {researching && (
        <div className="flex flex-col items-center py-20 text-center">
          <Globe size={150} spin />
          <p className="display mt-7 text-xl text-paper">
            Reading your world…
          </p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-smoke">
            Searching {world.areas.length} area
            {world.areas.length === 1 ? "" : "s"}, then throwing out everything
            that is not genuinely current. This takes a minute.
          </p>
        </div>
      )}

      {/* empty issue */}
      {!researching && items?.length === 0 && !noAreas && (
        <div className="mt-10">
          <p className="text-[15px] leading-relaxed text-paper/85">
            {date === today
              ? "Today's issue has not been researched yet."
              : "No issue was published on that date."}
          </p>
          {date === today && (
            <button
              onClick={research}
              className="display mt-5 bg-pink px-6 py-3 text-lg text-black transition hover:bg-pink-hot"
            >
              Research today
            </button>
          )}
        </div>
      )}

      {/* the issue */}
      {!researching && items && items.length > 0 && (
        <>
          <div className="divide-y divide-pink/15">
            {items.map((it, i) => (
              <article key={it.id} className="rise py-7">
                <div className="flex items-baseline gap-3">
                  <span className="display text-pink/45">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="eyebrow text-pink">{it.area}</span>
                </div>
                <h2 className="display mt-2 text-[clamp(1.3rem,3vw,1.9rem)] leading-tight text-paper">
                  {it.headline}
                </h2>
                <p className="mt-3 text-[15px] leading-relaxed text-paper/85">
                  {it.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {it.sources.map((s, j) => (
                    <a
                      key={j}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="border border-paper/15 px-2.5 py-1 text-[11px] text-smoke transition hover:border-pink hover:text-pink"
                    >
                      {hostOf(s.url)} ↗
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 border-t border-pink/20 pt-6">
            <p className="max-w-lg text-xs leading-relaxed text-smoke">
              Signals only. Nothing here is a product instruction, and none of
              it is sales data — what any of it means for your shop is your
              call. Every link came back from a real search; anything that
              could not be verified was dropped.
            </p>
            {date === today && (
              <button
                onClick={research}
                className="eyebrow mt-4 text-smoke transition hover:text-pink"
              >
                Re-research today
              </button>
            )}
          </div>
        </>
      )}

      {/* back issues */}
      {dates.length > 1 && (
        <div className="mt-12 border-t border-pink/20 pt-6">
          <p className="eyebrow text-pink/70">Back issues</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {dates.map((d) => (
              <button
                key={d}
                onClick={() => open(d)}
                className={`border px-3 py-1.5 text-xs transition ${
                  d === date
                    ? "border-pink bg-pink text-black"
                    : "border-paper/15 text-smoke hover:border-pink/60 hover:text-pink"
                }`}
              >
                {formatIssueDate(d)}
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
