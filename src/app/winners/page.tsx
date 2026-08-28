/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote } from "@/components/ui";
import ReadingBar from "@/components/ReadingBar";
import { report } from "@/lib/report";
import type { World } from "@/lib/world";
import {
  addExport,
  loadBriefs,
  loadWinners,
  perDay,
  readExport,
  readPatterns,
  readTheWorld,
  removeKeyword,
  removeWinner,
  SOLD_AT_LEAST,
  type BriefPoint,
  type StoredBrief,
  type Winner,
} from "@/lib/winners";

/**
 * The crown: how many of a group's designs get the accent border, and the
 * size a group has to reach before it is a distinction at all.
 *
 * It was a top five above ten designs, which stopped being possible when a
 * keyword's group was capped at ten — five of ten is half the group lit up,
 * which is not a highlight, it is a second colour scheme.
 */
const CROWN_TOP = 3;
const CROWN_ABOVE = 5;

const money = (n: number) =>
  n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

export default function WinnersPage() {
  return <Shell>{(world) => <WinnersBody world={world} />}</Shell>;
}

function WinnersBody({ world }: { world: World }) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [briefs, setBriefs] = useState<Record<string, StoredBrief>>({});
  /** The read across every corner, and whether it is on screen. */
  const [worldBrief, setWorldBrief] = useState<StoredBrief | null>(null);
  const [worldOpen, setWorldOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState("");
  /** The keyword currently being read, or "" when nothing is running. */
  const [reading, setReading] = useState("");
  /** Which keywords have their patterns showing. The read is stored, so this
   *  is only about what is on screen — hiding never throws anything away. */
  const [showing, setShowing] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  /* null until an upload has reported back whether Etsy's key is in place. */
  const [keyed, setKeyed] = useState<boolean | null>(null);
  /** The design opened full size, or null. */
  const [zoom, setZoom] = useState<Winner | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [w, b] = await Promise.all([
      loadWinners(world.id).catch(() => []),
      loadBriefs(world.id).catch(() => ({ world: null, byKeyword: {} })),
    ]);
    setWinners(w);
    setBriefs(b.byKeyword);
    setWorldBrief(b.world);
    setReady(true);
  }, [world.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function take(files: FileList | null) {
    if (!files?.length) return;
    setErr("");
    setSaid("");
    let added = 0;
    let already = 0;
    let thin = 0;

    try {
      for (const file of Array.from(files)) {
        setUploading(file.name);
        const parsed = await readExport(file);
        if (!parsed.kept.length) {
          thin++;
          continue;
        }
        const res = await addExport(world, parsed);
        added += res.added;
        already += res.already;
        setKeyed(res.keyed);
      }
      await refresh();
      setSaid(
        [
          added ? `${added} added` : "",
          already ? `${already} already here` : "",
          thin ? `${thin} had nothing over ${SOLD_AT_LEAST} sales` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      );
    } catch (e) {
      report("winners", e, { worldId: world.id });
      setErr(e instanceof Error ? e.message : "That upload did not go through.");
    } finally {
      setUploading("");
      if (pick.current) pick.current.value = "";
    }
  }

  /* The whole world. "*" marks it in the reading state. */
  async function readWorld() {
    setReading("*");
    setErr("");
    setSaid("");
    try {
      await readTheWorld(world);
      await refresh();
      setWorldOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      if (!msg.toLowerCase().includes("limit"))
        report("winners-read", e, { worldId: world.id, scope: "world" });
      setErr(msg);
    } finally {
      setReading("");
    }
  }

  async function read(keyword: string) {
    setReading(keyword);
    setErr("");
    setSaid("");
    try {
      await readPatterns(world, keyword);
      await refresh();
      setShowing((s) => ({ ...s, [keyword]: true }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      if (!msg.toLowerCase().includes("limit"))
        report("winners-read", e, { worldId: world.id, keyword });
      setErr(msg);
    } finally {
      setReading("");
    }
  }

  /*
    Grouped by keyword, because that is how the files arrive and it is the one
    honest thing a keyword tells you: which search this design was winning.
    Biggest group first so the world's centre of gravity is at the top.

    The crown is per keyword rather than across the wall on purpose. A loose
    world's keywords are separate sub-worlds, and one big keyword would take
    every highlight on the page if the top five were global.
  */
  const groups = useMemo(() => {
    const by = new Map<string, Winner[]>();
    for (const w of winners) {
      const list = by.get(w.keyword) ?? [];
      list.push(w);
      by.set(w.keyword, list);
    }
    return [...by.entries()]
      .map(([keyword, list]) => {
        const established = [...list].sort((a, b) => b.sales - a.sales)[0];
        const byRate = [...list].sort((a, b) => perDay(b) - perDay(a));
        /*
          Always two featured tiles, because one tile in a two-up row leaves
          half the width empty. When the biggest seller is also the fastest,
          the second slot goes to the next fastest rather than being dropped —
          which is a real thing to show, not filler.
        */
        const now = byRate[0];
        const second =
          established.id === now.id
            ? byRate.find((w) => w.id !== established.id)
            : now;
        const featured = second ? [established, second] : [established];
        const secondFlag =
          established.id === now.id ? "next fastest" : "winning now";
        const rest = list
          .filter((w) => !featured.some((f) => f.id === w.id))
          .sort((a, b) => b.sales - a.sales);

        const crowned = new Set(
          list.length > CROWN_ABOVE
            ? [...list]
                .sort((a, b) => b.sales - a.sales)
                .slice(0, CROWN_TOP)
                .map((w) => w.id)
            : [],
        );

        return {
          keyword,
          list,
          established,
          now,
          featured,
          rest,
          crowned,
          secondFlag,
          revenue: list.reduce((sum, w) => sum + w.revenue, 0),
          // The whole group came off one export, so the newest row dates it.
          dated: list.reduce(
            (latest, w) => (w.refreshedAt > latest ? w.refreshedAt : latest),
            list[0].refreshedAt,
          ),
        };
      })
      .sort((a, b) => b.list.length - a.list.length);
  }, [winners]);

  /*
    Collapsed by default past the first group.

    Not for tidiness — for weight. Every open group is ten product
    photographs, and a seller with twenty keywords would be loading fifteen
    megabytes of images to look at one of them. A closed group renders none of
    its tiles, so the page costs the same at thirty keywords as at three, and
    no artificial cap on keywords is needed.
  */
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const isOpen = (k: string, i: number) => (k in shut ? !shut[k] : i === 0);
  const toggle = (k: string, i: number) =>
    setShut((s) => ({ ...s, [k]: k in s ? !s[k] : i !== 0 ? false : true }));

  const withArt = winners.filter((w) => w.imageUrl).length;

  return (
    <Page width="full">
      {zoom && <Zoom w={zoom} onClose={() => setZoom(null)} />}

      <header className="mb-12 border-b-2 border-black pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world winners</span>
          {winners.length > 0 && (
            <span className="t-small text-ink-3">
              {winners.length} designs
            </span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          what listings are{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            winning in your world
          </span>
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {err && <ErrorNote>{err}</ErrorNote>}

      {/*
        The numbers work without Etsy's key; the pictures do not, and the
        pictures are the feature. Say that plainly rather than letting the
        wall fill up with grey boxes that look like a bug.
      */}
      {keyed === false && (
        <div className="note t-small mb-5 px-4 py-3 text-ink-2">
          The designs are missing because Etsy&rsquo;s key is not connected
          yet. Everything you upload is being kept, and the artwork will fill
          in once it is.
        </div>
      )}

      {/* ------------------------------------------------------- upload */}
      <div className="mb-20 flex flex-wrap items-center gap-3">
        <input
          ref={pick}
          type="file"
          accept=".csv,text/csv"
          multiple
          className="hidden"
          onChange={(e) => take(e.target.files)}
        />
        <button
          onClick={() => pick.current?.click()}
          className="btn btn-accent"
          disabled={!!uploading || !!reading}
        >
          {uploading ? "Adding…" : "Add an eRank export"}
        </button>
        {uploading && <span className="t-small text-ink-3">{uploading}</span>}
        {said && !uploading && (
          <span className="t-small text-ink-2">{said}</span>
        )}
        {!uploading && !said && (
          <span className="t-small text-ink-3">
            Top Listings, exported as CSV. Several at once is fine.
          </span>
        )}
      </div>

      {/*
        THE READ ACROSS EVERY CORNER.

        The wall already shows what sells across the whole world — this says
        what is true of it. One design from each keyword, so it is looking at
        real artwork rather than summarising summaries, and so one large
        keyword cannot drown the rest.

        Once a week. The wall only moves when an export is uploaded, so a
        second press on the same day is reading the same world again.
      */}
      {reading === "*" && (
        <Card className="mb-16 flex flex-col items-center py-12 text-center">
          <img
            src="/globe.png"
            alt=""
            className="globe-turn h-12 w-12 opacity-80"
          />
          <p className="t-h3 mt-4 text-ink">Reading across your world…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={40} />
        </Card>
      )}

      {reading !== "*" && groups.length >= 2 && (
        <Card className="mb-16">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b-2 border-black pb-4">
            <button
              onClick={() =>
                worldBrief ? setWorldOpen((v) => !v) : readWorld()
              }
              aria-expanded={worldOpen}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {worldBrief && (
                <span
                  className="shrink-0 text-ink-3 transition-transform"
                  style={{ transform: worldOpen ? "rotate(90deg)" : "none" }}
                  aria-hidden
                >
                  ▶
                </span>
              )}
              <span className="t-h2 text-ink">Across your whole world</span>
            </button>

            {worldBrief && (
              <span className="t-small shrink-0 text-ink-3">
                Last read {when(worldBrief.ranAt)}
              </span>
            )}
            <button
              onClick={worldBrief ? () => readWorld() : () => readWorld()}
              className="btn btn-ghost shrink-0"
              disabled={!!reading}
            >
              {worldBrief ? "Read it again" : "Read my world"}
            </button>
          </div>

          {!worldBrief && (
            <p className="t-small mt-4 text-ink-2">
              What holds true across all {groups.length} keywords, and where
              they pull apart. Once a week.
            </p>
          )}

          {worldBrief && worldOpen && (
            <Patterns points={worldBrief.brief.patterns} />
          )}
        </Card>
      )}

      {/* --------------------------------------------------------- wall */}
      {ready && !winners.length && (
        <Empty
          title="Nothing on the wall yet"
          body={`Export Top Listings from eRank for a keyword in this world. Anything over ${SOLD_AT_LEAST} sales goes up, with the artwork.`}
          action={
            <button onClick={() => pick.current?.click()} className="btn btn-accent">
              Add an export
            </button>
          }
        />
      )}

      {groups.map((g, i) => {
        const open = isOpen(g.keyword, i);
        const drop = async (w: Winner) => {
          await removeWinner(w.id);
          refresh();
        };

        return (
          <section key={g.keyword} className="mb-28">
            {/* ------------------------------------------------ the header */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b-2 border-black pb-4">
              <button
                onClick={() => toggle(g.keyword, i)}
                aria-expanded={open}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <span
                  className="t-small shrink-0 text-ink-3 transition-transform"
                  style={{ transform: open ? "rotate(90deg)" : "none" }}
                  aria-hidden
                >
                  ▶
                </span>
                <h2 className="t-h2 truncate text-ink">{g.keyword}</h2>

                {/*
                  A collapsed accordion is a grey bar with a word on it, and
                  the whole point of this page is that you can see your world.
                  So the group's two featured designs ride in the header and
                  stay visible whether it is open or shut.
                */}
                {!open && (
                  <span className="flex shrink-0 gap-1.5">
                    {g.featured.map(
                      (w) =>
                        w.imageUrl && (
                          <img
                            key={w.id}
                            src={w.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-9 w-9 rounded object-cover"
                          />
                        ),
                    )}
                  </span>
                )}
              </button>

              {/*
                Show patterns belongs beside the keyword, not away at the
                other end with the housekeeping. It is the thing you came to
                press, and the rule between them says it belongs to this
                keyword rather than to the row.
              */}
              <span className="h-6 w-px shrink-0 bg-black/20" aria-hidden />
              <button
                onClick={() => {
                  if (!open) toggle(g.keyword, i);
                  if (!briefs[g.keyword]) read(g.keyword);
                  else setShowing((s) => ({ ...s, [g.keyword]: !s[g.keyword] }));
                }}
                className="btn btn-ghost shrink-0"
                disabled={!!reading || g.list.length < 3}
              >
                {reading === g.keyword
                  ? "Reading…"
                  : briefs[g.keyword] && showing[g.keyword]
                    ? "Hide patterns"
                    : "Show patterns"}
              </button>

              {/*
                Said plainly, next to the button, because nothing here
                refreshes on its own and a page of sales figures with no date
                on it reads as live. These numbers are eRank's estimates from
                the day the file was exported and they will sit there being
                that day's numbers until another export replaces them.
              */}
              <span className="t-small shrink-0 text-ink-3">
                Last updated {when(g.dated)}
              </span>

              {/* Everything past here is reference and housekeeping. */}
              <span className="flex-1" />

              <span className="t-small shrink-0 text-ink-3">
                {g.list.length} designs · {money(g.revenue)}
              </span>
              {/*
                A viewer rather than a download. Ten designs at a size where
                they all fit on one screen is a thing the seller can
                screenshot in one go and drop into Goldie — no archive, no
                unzipping, no ten files in a Downloads folder.
              */}
              <a
                href={`/winners/view?world=${world.id}&keyword=${encodeURIComponent(g.keyword)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="t-small shrink-0 text-ink-3 transition hover:text-ink"
              >
                View all ↗
              </a>
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Remove all ${g.list.length} designs under “${g.keyword}”? Uploading the export again brings them back.`,
                    )
                  )
                    return;
                  await removeKeyword(world.id, g.keyword);
                  refresh();
                }}
                className="t-small shrink-0 text-ink-3 transition hover:text-ink"
              >
                Remove keyword
              </button>
            </div>

            {reading === g.keyword && (
              <Card className="mt-4 flex flex-col items-center py-12 text-center">
                <img
                  src="/globe.png"
                  alt=""
                  className="globe-turn h-12 w-12 opacity-80"
                />
                <p className="t-h3 mt-4 text-ink">Looking at the designs…</p>
                <ReadingBar className="mt-4 max-w-xs" expect={30} />
              </Card>
            )}

            {open && briefs[g.keyword] && showing[g.keyword] && (
              <BriefPanel
                stored={briefs[g.keyword]}
                keyword={g.keyword}
                onRead={() => read(g.keyword)}
                busy={!!reading}
                /*
                  Stale means the group has been re-imported since the read,
                  not that the read saw fewer designs than the group holds —
                  it always does, because a read is capped at ten and a group
                  can be larger. Comparing counts flagged every brief as
                  stale the moment it was written.
                */
                stale={
                  new Date(g.dated).getTime() >
                  new Date(briefs[g.keyword].ranAt).getTime()
                }
              />
            )}

            {/*
              One grid, every tile the same size.

              The two featured designs used to run half the page wide above
              the rest, which made a keyword feel like a poster rather than a
              wall — two enormous photographs and then everything else. They
              are already marked by their flag and by the accent border; being
              physically twice the size on top of that was saying the same
              thing three times, loudly.

              Small tiles need a way back to a big one, so the artwork opens.
            */}
            {open && (
              <div className="mt-8 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
                {[...g.featured, ...g.rest].map((w) => (
                  <Tile
                    key={w.id}
                    w={w}
                    crowned={g.crowned.has(w.id)}
                    flag={
                      w.id === g.established.id
                        ? "most sales"
                        : w.id === g.featured[1]?.id
                          ? g.secondFlag
                          : undefined
                    }
                    onOpen={() => setZoom(w)}
                    onDrop={() => drop(w)}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

/**
 * ONE PATTERN AT A TIME.
 *
 * Six patterns stacked in a panel is a wall of text sitting on top of a wall
 * of pictures, and every layout attempt at it fought the same problem: too
 * much at once, with nothing telling the eye where to start.
 *
 * A stepper solves it by not asking. One finding fills the box, the counter
 * says how far through you are, and nothing else competes. The trade is that
 * you cannot skim all six or compare two side by side — worth it at five or
 * six findings, and it would not be at twenty.
 *
 * The box holds its height so the buttons do not jump between a short finding
 * and a long one, which is the thing that makes a stepper feel broken.
 */
function Patterns({ points }: { points: BriefPoint[] }) {
  const [at, setAt] = useState(0);
  // A fresh read is a different set of findings; start at its beginning.
  useEffect(() => setAt(0), [points]);

  if (!points.length) return null;
  const p = points[Math.min(at, points.length - 1)];
  const last = points.length - 1;

  return (
    <div className="mt-6 max-w-[64ch]">
      <div
        className="flex min-h-[168px] flex-col justify-center border-l-2 pl-5"
        style={{ borderColor: "var(--accent)" }}
      >
        <p className="t-h3 leading-snug text-ink">{p.heading}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{p.body}</p>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-black/10 pt-3">
        <span className="t-small text-ink-3">
          {Math.min(at, last) + 1} of {points.length}
        </span>

        <span className="flex flex-1 gap-1.5" aria-hidden>
          {points.map((_, i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i <= at ? "var(--accent)" : "rgba(0,0,0,0.12)",
              }}
            />
          ))}
        </span>

        <button
          onClick={() => setAt((n) => Math.max(0, n - 1))}
          className="btn btn-ghost"
          disabled={at === 0}
          aria-label="Previous pattern"
        >
          ←
        </button>
        <button
          onClick={() => setAt((n) => Math.min(last, n + 1))}
          className="btn btn-ghost"
          disabled={at >= last}
          aria-label="Next pattern"
        >
          →
        </button>
      </div>
    </div>
  );
}

/**
 * ONE KEYWORD'S PATTERNS.
 *
 * The box around the stepper. It carries only what the stepper cannot: which
 * keyword and how many designs this was read from, whether the group has
 * been re-imported since, and the way to run it again.
 *
 * There is no fold in here — the Show patterns button in the group header is
 * the fold.
 */
function BriefPanel({
  stored,
  keyword,
  onRead,
  busy,
  stale,
}: {
  stored: StoredBrief;
  keyword: string;
  onRead: () => void;
  busy: boolean;
  /** The group has changed since this was read, so it describes a wall that
   *  is no longer quite there. */
  stale: boolean;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Card className="mt-8 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
        <p className="t-small text-ink-3">
          Patterns across {stored.counted} designs under &ldquo;{keyword}&rdquo;
          {stale && " · the group has changed since this was read"}
        </p>
        <div className="flex shrink-0 gap-2">
          {/* The patterns as text, to paste wherever the seller designs. */}
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  stored.brief.patterns
                    .map((p) => `${p.heading}. ${p.body}`)
                    .join("\n\n"),
                );
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                /* A browser that refuses the clipboard leaves the label be. */
              }
            }}
            className="btn btn-ghost"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <button onClick={onRead} className="btn btn-ghost" disabled={busy}>
            {stale ? "Read it again" : "Refresh"}
          </button>
        </div>
      </div>

      <Patterns points={stored.brief.patterns} />
    </Card>
  );
}

/**
 * ONE DESIGN, BIG.
 *
 * The wall is small tiles now, which is right for taking a keyword in at a
 * glance and wrong for actually looking at a design. So any tile opens to
 * the full-size photograph with its numbers beside it.
 *
 * Through a portal, because the content column sits below the navigation
 * rail in the same stacking context and an overlay written inside it comes
 * out underneath the sidebar.
 */
function Zoom({ w, onClose }: { w: Winner; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = had;
    };
  }, [onClose]);

  const view = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-10"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={w.design ?? w.title}
    >
      {/* The card itself must not close it. */}
      <div
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={(w.imageUrl ?? "").replace(/il_\d+x[N\d]+\./i, "il_fullxfull.")}
          alt={w.design ?? w.title}
          className="mx-auto max-h-[70vh] w-auto rounded"
        />

        <div className="mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="numeral text-[1.3rem] text-ink">
            {w.sales.toLocaleString()}
          </span>
          <span className="t-small text-ink-2">sales</span>
          <span className="t-small font-bold text-ink">
            {perDay(w).toFixed(1)}/day
          </span>
          <span className="t-small text-ink-3">{w.ageDays} days</span>
          {w.hearts > 0 && (
            <span className="t-small text-ink-3">
              {w.hearts.toLocaleString()} saved
              {w.views ? ` · ${((100 * w.hearts) / w.views).toFixed(0)}% of views` : ""}
            </span>
          )}
        </div>

        {w.design && <p className="t-small mt-2 text-ink-2">{w.design}</p>}

        <div className="t-small mt-3 flex items-center justify-between gap-4 text-ink-3">
          <a
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
            className="transition hover:text-ink"
          >
            {w.shop || "on Etsy"} ↗
          </a>
          <button onClick={onClose} className="btn btn-ghost">
            Close
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(view, document.body);
}

/**
 * One design.
 *
 * Pink means exactly one thing on this page: this is a top seller in its
 * keyword. The flags used to be pink too, and three pink things on one screen
 * is no signal at all — they are labels, so they are plain, and the colour is
 * spent on the border you should be able to spot from across the room.
 *
 * Every tile is the same size and the artwork opens on click. Two of them
 * used to run half the page wide, which made the page feel like a poster
 * instead of a wall.
 */
function Tile({
  w,
  flag,
  crowned = false,
  onOpen,
  onDrop,
}: {
  w: Winner;
  flag?: string;
  crowned?: boolean;
  onOpen: () => void;
  onDrop: () => void;
}) {
  return (
    <figure
      className="card overflow-hidden"
      style={
        crowned
          ? {
              borderColor: "var(--accent)",
              boxShadow: "0 0 0 2px var(--accent)",
            }
          : undefined
      }
    >
      <button
        onClick={onOpen}
        className="relative block w-full bg-black/[0.04]"
        aria-label={`Open ${w.design ?? w.title}`}
      >
        {w.imageUrl ? (
          <img
            src={w.imageUrl}
            alt={w.design ?? w.title}
            loading="lazy"
            className="aspect-square w-full object-cover"
          />
        ) : (
          <span className="flex aspect-square items-center justify-center">
            <span className="t-small text-ink-3">No picture</span>
          </span>
        )}
        {flag && (
          <span className="absolute left-2 top-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-bold text-white">
            {flag}
          </span>
        )}
      </button>

      <figcaption className="p-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="numeral text-[1rem] text-ink">
            {w.sales.toLocaleString()}
          </span>
          <span className="t-small text-ink-2">sales</span>
          <span className="t-small font-bold text-ink">
            {perDay(w).toFixed(1)}/day
          </span>
        </div>
        <p className="t-small mt-0.5 text-ink-3">
          {w.ageDays} days
          {w.hearts > 0 && ` · ${w.hearts.toLocaleString()} saved`}
        </p>

        <div className="t-small mt-2 flex items-center justify-between gap-2 text-ink-3">
          <a
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate transition hover:text-ink"
          >
            {w.shop || "on Etsy"} ↗
          </a>
          <button
            onClick={onDrop}
            className="shrink-0 transition hover:text-ink"
          >
            Remove
          </button>
        </div>
      </figcaption>
    </figure>
  );
}
