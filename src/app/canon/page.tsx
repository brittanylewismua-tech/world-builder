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
} from "@/lib/canon";

export default function CanonPage() {
  return <Shell>{(world) => <CanonBody world={world} />}</Shell>;
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
    Said out loud before the button is pressed, because this feature is
    honestly thin in week one. A seller who can see they have nine pieces
    understands why the canon is short, instead of concluding it is broken.
  */
  const total = have ? have.signals + have.pieces + have.findings : 0;

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
          body={
            total < 15
              ? `Your world holds ${total} piece${total === 1 ? "" : "s"} so far. This gets better the more there is.`
              : "Read everything at once and see what it adds up to."
          }
          action={
            <button onClick={build} className="btn btn-accent">
              Write it
            </button>
          }
        />
      )}

      {!building && canon && (
        <>
          <div className="space-y-7">
            {SECTIONS.map((s) => {
              const text = canon.sections[s.id];
              if (!text) return null;
              return (
                <section key={s.id}>
                  <h2 className="eyebrow mb-2 text-ink-3">{s.title}</h2>
                  <div className="t-body whitespace-pre-wrap text-ink-2">
                    <Said text={text} />
                  </div>
                </section>
              );
            })}
          </div>

          <div className="mt-8 border-t border-black/10 pt-4">
            {/* What it was built from. The canon should visibly sharpen as the
                evidence grows, and that is only legible if the count is here. */}
            <p className="t-small text-ink-3">
              Built from {canon.evidence.signals ?? 0} signals,{" "}
              {canon.evidence.pieces ?? 0} saved pieces and{" "}
              {canon.evidence.drops ?? 0} drops.
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
