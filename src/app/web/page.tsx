"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote } from "@/components/ui";
import ReadingBar from "@/components/ReadingBar";
import { report } from "@/lib/report";
import { saveSignalToBoard } from "@/lib/board";
import { splitDrops, syncSchedule, type Drop } from "@/lib/drops";
import type { World } from "@/lib/world";
import {
  growWeb,
  hideNode,
  lastGrown,
  layout,
  loadWeb,
  type WebNode,
} from "@/lib/web";

const SIZE = 900;

export default function WebPage() {
  return <Shell>{(world) => <WebBody world={world} />}</Shell>;
}

function WebBody({ world }: { world: World }) {
  const [nodes, setNodes] = useState<WebNode[]>([]);
  const [grownAt, setGrownAt] = useState<string | null>(null);
  const [open, setOpen] = useState<WebNode | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [soon, setSoon] = useState(false);

  const refresh = useCallback(async () => {
    const [n, at] = await Promise.all([
      loadWeb(world.id).catch(() => []),
      lastGrown(world.id).catch(() => null),
    ]);
    setNodes(n);
    setGrownAt(at);
    setReady(true);
  }, [world.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    syncSchedule(world)
      .then((all) => setDrop(splitDrops(all).next))
      .catch(() => setDrop(null));
  }, [world]);

  async function grow() {
    setBusy(true);
    setErr("");
    setSoon(false);
    setOpen(null);
    try {
      await growWeb(world);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      const already = msg.toLowerCase().includes("already grown");
      if (!already) report("web", e, { worldId: world.id });
      setSoon(already);
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  const placed = useMemo(() => layout(nodes, SIZE), [nodes]);
  const since = grownAt ? new Date(grownAt).getTime() : 0;
  const fresh = new Set(
    nodes
      .filter((n) => n.kind === "found" && new Date(n.firstSeen).getTime() >= since - 60_000)
      .map((n) => n.id),
  );

  const found = nodes.filter((n) => n.kind === "found").length;

  return (
    <Page>
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world web</span>
          {found > 0 && (
            <span className="t-small text-ink-3">{found} things in this world</span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          your keywords, and{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            everything around them
          </span>
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {err && soon && (
        <p className="t-small mb-5 rounded-lg bg-black/[0.04] px-3 py-2 text-ink-2">
          {err}
        </p>
      )}
      {err && !soon && <ErrorNote>{err}</ErrorNote>}

      {busy && (
        <Card className="flex flex-col items-center py-14 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/globe.png" alt="" className="globe-turn h-14 w-14 opacity-80" />
          <p className="t-h3 mt-5 text-ink">Reading the world…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={100} />
          <p className="t-small mt-1.5 text-ink-3">A minute or two.</p>
        </Card>
      )}

      {!busy && ready && !found && (
        <Empty
          title="Nothing on the web yet"
          body="Your Etsy keywords are only part of a world. This goes and finds the rest."
          action={
            <button onClick={grow} className="btn btn-accent">
              Grow it
            </button>
          }
        />
      )}

      {!busy && found > 0 && (
        <div className="lg:flex lg:gap-6">
          {/* ------------------------------------------------------ map */}
          <div className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-black/15 bg-white">
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className="h-auto w-full min-w-[680px]"
              role="img"
              aria-label="Your world, as a web"
            >
              {placed
                .filter((p) => p.node.kind === "found")
                .map((p) => (
                  <line
                    key={`l-${p.node.id}`}
                    x1={p.anchorX}
                    y1={p.anchorY}
                    x2={p.x}
                    y2={p.y}
                    stroke="rgba(0,0,0,0.14)"
                    strokeWidth="1"
                  />
                ))}

              {placed.map((p) => {
                const isKey = p.node.kind === "keyword";
                const isNew = fresh.has(p.node.id);
                const label =
                  p.node.label.length > 26
                    ? `${p.node.label.slice(0, 25)}…`
                    : p.node.label;
                const w = Math.max(52, label.length * 6.6 + 18);
                return (
                  <g
                    key={p.node.id}
                    transform={`translate(${p.x} ${p.y})`}
                    onClick={() => !isKey && setOpen(p.node)}
                    style={{ cursor: isKey ? "default" : "pointer" }}
                  >
                    <rect
                      x={-w / 2}
                      y={-12}
                      width={w}
                      height={24}
                      rx={12}
                      fill={isKey ? "#000" : isNew ? "var(--accent)" : "#fff"}
                      stroke={isKey ? "#000" : "rgba(0,0,0,0.35)"}
                      strokeWidth={isKey ? 2 : 1}
                    />
                    <text
                      textAnchor="middle"
                      dy="4"
                      fontSize={isKey ? 12 : 11}
                      fontWeight={isKey ? 800 : 600}
                      fill={isKey ? "#fff" : isNew ? "#fff" : "#111"}
                    >
                      {label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* --------------------------------------------------- reading */}
          <aside className="mt-5 w-full shrink-0 lg:mt-0 lg:w-[340px]">
            {open ? (
              <div className="card sticky top-4 p-4">
                <p className="t-h3 text-ink">{open.label}</p>
                {open.note && (
                  <p className="t-small mt-2 text-ink-2">{open.note}</p>
                )}
                {open.quote && (
                  <blockquote className="mt-3 border-l-2 border-black/20 pl-3 text-[14px] leading-relaxed text-ink">
                    “{open.quote}”
                  </blockquote>
                )}
                <div className="t-small mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-3">
                  {open.anchor && <span>near “{open.anchor}”</span>}
                  {open.score !== null && <span>{open.score.toLocaleString()} upvotes</span>}
                  {open.seenOn && <span>{open.seenOn}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {open.url && (
                    <a
                      href={open.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-ghost"
                    >
                      {open.source || "source"} ↗
                    </a>
                  )}
                  {drop && (
                    <button
                      onClick={async () => {
                        if (saved[open.id]) return;
                        await saveSignalToBoard(world, drop, {
                          headline: open.label,
                          body: `${open.note ?? ""}${open.quote ? `\n\n“${open.quote}”` : ""}`,
                          url: open.url,
                        });
                        setSaved((s) => ({ ...s, [open.id]: true }));
                      }}
                      className="btn btn-ghost"
                    >
                      {saved[open.id] ? "Saved" : "Save to my board"}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await hideNode(open.id);
                      setOpen(null);
                      refresh();
                    }}
                    className="t-small text-ink-3 transition hover:text-ink"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <p className="t-small text-ink-3">
                Tap anything on the web to read it.
              </p>
            )}
          </aside>
        </div>
      )}

      {!busy && found > 0 && (
        <div className="mt-8 border-t border-black/10 pt-4">
          <button onClick={grow} className="btn btn-ghost" disabled={busy}>
            Grow the web
          </button>
          <p className="t-small mt-1.5 text-ink-3">Once a day.</p>
        </div>
      )}
    </Page>
  );
}
