"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote } from "@/components/ui";
import ReadingBar from "@/components/ReadingBar";
import { report } from "@/lib/report";
import type { World } from "@/lib/world";
import {
  hideTerm,
  loadRuns,
  loadTerms,
  movement,
  runUpdate,
  todaysUpdate,
  type Term,
} from "@/lib/trends";

export default function TrendsPage() {
  return <Shell>{(world) => <TrendsBody world={world} />}</Shell>;
}

/** A term's year, drawn small. Shape matters here; precision does not. */
function Spark({ curve }: { curve: Term["curve"] }) {
  if (!curve || curve.length < 4) return null;
  const w = 96;
  const h = 22;
  const max = Math.max(...curve.map((p) => p.v), 1);
  const step = w / (curve.length - 1);
  const d = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p.v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

function Row({ t, onHide }: { t: Term; onHide: (id: string) => void }) {
  const m = movement(t);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{t.term}</p>
        {t.foundNear && (
          <p className="t-small text-ink-3">near “{t.foundNear}”</p>
        )}
      </div>
      <Spark curve={t.curve} />
      {m !== null && (
        <span
          className={`w-12 shrink-0 text-right text-[13px] font-bold ${
            m > 0 ? "text-ink" : "text-ink-3"
          }`}
        >
          {m > 0 ? "+" : ""}
          {m}
        </span>
      )}
      <a
        href={`https://trends.google.com/trends/explore?q=${encodeURIComponent(t.term)}&geo=US`}
        target="_blank"
        rel="noopener noreferrer"
        className="t-small shrink-0 text-ink-3 underline underline-offset-2 transition hover:text-ink"
      >
        open
      </a>
      <button
        onClick={() => onHide(t.id)}
        title="Stop watching this"
        className="t-small shrink-0 text-ink-3 transition hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}

function TrendsBody({ world }: { world: World }) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [soon, setSoon] = useState(false);

  const refresh = useCallback(async () => {
    const [t, runs] = await Promise.all([
      loadTerms(world.id).catch(() => []),
      loadRuns(world.id).catch(() => []),
    ]);
    setTerms(t);
    setLastRun(runs[0]?.ranAt ?? null);
    setReady(true);
  }, [world.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function update() {
    setRunning(true);
    setErr("");
    setSoon(false);
    try {
      await runUpdate(world);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      // Already updated today is a fact, not a fault.
      const already = msg.toLowerCase().includes("already here");
      if (!already) report("trends", e, { worldId: world.id });
      setSoon(already);
      setErr(msg);
    } finally {
      setRunning(false);
    }
  }

  const { fresh, moved } = todaysUpdate(terms, lastRun);

  return (
    <Page width="reading">
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">rising</span>
          {terms.length > 0 && (
            <span className="t-small text-ink-3">
              {terms.length} terms watched
            </span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          what is{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            climbing
          </span>{" "}
          around your world
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {err && soon && (
        <p className="t-small mb-5 rounded-lg bg-black/[0.04] px-3 py-2 text-ink-2">
          {err}
        </p>
      )}
      {err && !soon && <ErrorNote>{err}</ErrorNote>}

      {running && (
        <Card className="flex flex-col items-center py-14 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/globe.png" alt="" className="globe-turn h-14 w-14 opacity-80" />
          <p className="t-h3 mt-5 text-ink">Checking…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={45} />
        </Card>
      )}

      {!running && ready && !terms.length && (
        <Empty
          title="Nothing being watched yet"
          body="Your validated keywords start it off. It grows from there on its own."
          action={
            <button onClick={update} className="btn btn-accent">
              Start watching
            </button>
          }
        />
      )}

      {!running && terms.length > 0 && (
        <>
          {fresh.length > 0 && (
            <section className="mb-7">
              <p className="eyebrow mb-2 text-ink-3">New in your world</p>
              <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/15 bg-white">
                {fresh.map((t) => (
                  <Row
                    key={t.id}
                    t={t}
                    onHide={async (id) => {
                      await hideTerm(id);
                      refresh();
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {moved.length > 0 && (
            <section className="mb-7">
              <p className="eyebrow mb-2 text-ink-3">Moved</p>
              <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/15 bg-white">
                {moved.slice(0, 12).map((t) => (
                  <Row
                    key={t.id}
                    t={t}
                    onHide={async (id) => {
                      await hideTerm(id);
                      refresh();
                    }}
                  />
                ))}
              </div>
            </section>
          )}

          {!fresh.length && !moved.length && (
            <p className="t-small text-ink-2">
              Nothing has moved since the last check.
            </p>
          )}

          <div className="mt-8 border-t border-black/10 pt-4">
            <button onClick={update} className="btn btn-ghost" disabled={running}>
              Update
            </button>
            <p className="t-small mt-1.5 text-ink-3">Once a day.</p>
          </div>

          <details className="mt-8 border-t border-black/12 pt-5">
            <summary className="eyebrow cursor-pointer text-ink-3">
              Everything being watched
            </summary>
            <div className="mt-3 divide-y divide-black/10 overflow-hidden rounded-xl border border-black/15 bg-white">
              {terms.map((t) => (
                <Row
                  key={t.id}
                  t={t}
                  onHide={async (id) => {
                    await hideTerm(id);
                    refresh();
                  }}
                />
              ))}
            </div>
          </details>
        </>
      )}
    </Page>
  );
}
