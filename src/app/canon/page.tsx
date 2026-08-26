"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote } from "@/components/ui";
import Said from "@/components/Said";
import ReadingBar from "@/components/ReadingBar";
import { LimitReached } from "@/lib/askAI";
import { report } from "@/lib/report";
import type { World } from "@/lib/world";
import {
  SECTIONS,
  buildCanon,
  canonEvidence,
  formatBuilt,
  loadCanon,
  loadCanonHistory,
  loadCanonVersion,
  type Canon,
  type SectionId,
} from "@/lib/canon";

export default function CanonPage() {
  return <Shell>{(world) => <CanonBody world={world} />}</Shell>;
}

/** The first line of a section, for the tile. Never more. */
function preview(text: string) {
  const flat = text.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const stop = flat.search(/[.!?]\s/);
  return stop > 40 ? flat.slice(0, stop + 1) : flat.slice(0, 150);
}

function CanonBody({ world }: { world: World }) {
  const [canon, setCanon] = useState<Canon | null>(null);
  const [history, setHistory] = useState<
    { id: string; builtAt: string; evidence: Canon["evidence"] }[]
  >([]);
  const [have, setHave] = useState<{
    signals: number;
    pieces: number;
    drops: number;
    findings: number;
  } | null>(null);
  const [open, setOpen] = useState<SectionId | null>(null);
  const [ready, setReady] = useState(false);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState("");
  const [capped, setCapped] = useState(false);

  const refresh = useCallback(async () => {
    const [c, h, e] = await Promise.all([
      loadCanon(world.id).catch(() => null),
      loadCanonHistory(world.id).catch(() => []),
      canonEvidence(world.id).catch(() => null),
    ]);
    setCanon(c);
    setHistory(h);
    setHave(e);
    setReady(true);
  }, [world.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function build() {
    setBuilding(true);
    setErr("");
    setCapped(false);
    setOpen(null);
    try {
      await buildCanon(world);
      await refresh();
    } catch (e) {
      const limit = e instanceof LimitReached;
      if (!limit) report("canon", e, { worldId: world.id });
      setCapped(limit);
      setErr(e instanceof Error ? e.message : "That did not finish.");
    } finally {
      setBuilding(false);
    }
  }

  /*
    How much has arrived since this was written.

    The canon is a standing document, so the useful question on arriving is
    not when it was built but whether the world has moved since. One number
    answers that, and it is also the trigger the overnight rebuild uses.
  */
  const now = have ? have.signals + have.pieces + have.findings : 0;
  const then = canon
    ? (canon.evidence.signals ?? 0) +
      (canon.evidence.pieces ?? 0) +
      (canon.evidence.findings ?? 0)
    : 0;
  const since = Math.max(0, now - then);

  const section = open ? SECTIONS.find((s) => s.id === open) : null;

  return (
    <Page width="reading">
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world canon</span>
          {canon && (
            <span className="t-small text-ink-3">
              {formatBuilt(canon.builtAt)}
            </span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          everything this world{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            has told you
          </span>{" "}
          so far
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {err && capped && (
        <p className="t-small mb-5 rounded-lg bg-black/[0.04] px-3 py-2 text-ink-2">
          {err}
        </p>
      )}
      {err && !capped && <ErrorNote>{err}</ErrorNote>}

      {building && (
        <Card className="flex flex-col items-center py-14 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/globe.png" alt="" className="globe-turn h-14 w-14 opacity-80" />
          <p className="t-h3 mt-5 text-ink">Reading everything…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={90} />
          <p className="t-small mt-1.5 text-ink-3">A minute or two.</p>
        </Card>
      )}

      {!building && ready && !canon && (
        <Empty
          title="Nothing written yet"
          body="Read everything at once and see what it adds up to."
          action={
            <button onClick={build} className="btn btn-accent">
              Write it
            </button>
          }
        />
      )}

      {/* ---------------------------------------------- one section, open */}
      {!building && canon && section && (
        <>
          <button
            onClick={() => setOpen(null)}
            className="t-small mb-4 text-ink-2 underline underline-offset-2 transition hover:text-ink"
          >
            ← All of it
          </button>
          <h2 className="t-h2 text-ink">{section.title}</h2>
          <div className="t-body mt-3 whitespace-pre-wrap text-ink-2">
            <Said text={canon.sections[section.id] ?? ""} />
          </div>

          <div className="mt-8 flex flex-wrap gap-2 border-t border-black/10 pt-4">
            {SECTIONS.filter((s) => s.id !== section.id && canon.sections[s.id]).map(
              (s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setOpen(s.id);
                    window.scrollTo({ top: 0 });
                  }}
                  className="rounded-lg border border-black/20 px-2.5 py-1 text-[12px] text-ink-2 transition hover:border-black hover:text-ink"
                >
                  {s.title}
                </button>
              ),
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------------- the map */}
      {!building && canon && !section && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {SECTIONS.map((s) => {
              const text = canon.sections[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => setOpen(s.id)}
                  disabled={!text}
                  className="card card-hover flex h-full flex-col items-start p-4 text-left disabled:opacity-40"
                >
                  <span className="eyebrow text-ink-3">{s.title}</span>
                  <span className="t-small mt-2 line-clamp-4 text-ink-2">
                    {text ? preview(text) : "—"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 border-t border-black/10 pt-4">
            <p className="t-small text-ink-3">
              Built from {canon.evidence.signals ?? 0} signals,{" "}
              {canon.evidence.pieces ?? 0} saved pieces and{" "}
              {canon.evidence.drops ?? 0} drops.
              {since > 0 && (
                <>
                  {" "}
                  {since} new since.
                </>
              )}
            </p>
            <button
              onClick={build}
              className="btn btn-ghost mt-3"
              disabled={building}
            >
              Write it again
            </button>
          </div>

          {history.length > 1 && (
            <div className="mt-8 border-t border-black/12 pt-5">
              <p className="eyebrow mb-3 text-ink-3">Earlier</p>
              <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/15 bg-white">
                {history.slice(1).map((h) => (
                  <button
                    key={h.id}
                    onClick={async () => {
                      const v = await loadCanonVersion(h.id).catch(() => null);
                      if (v) setCanon(v);
                      window.scrollTo({ top: 0 });
                    }}
                    className="block w-full px-4 py-2.5 text-left transition hover:bg-black/[0.03]"
                  >
                    <span className="t-small text-ink-2">
                      {formatBuilt(h.builtAt)}
                    </span>
                    <span className="t-small ml-2 text-ink-3">
                      {h.evidence.pieces ?? 0} pieces
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Page>
  );
}
