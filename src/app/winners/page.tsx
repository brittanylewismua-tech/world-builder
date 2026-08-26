/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const pick = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [w, b] = await Promise.all([
      loadWinners(world.id).catch(() => []),
      loadBriefs(world.id).catch(() => ({})),
    ]);
    setWinners(w);
    setBriefs(b);
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
      <header className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world winners</span>
          {winners.length > 0 && (
            <span className="t-small text-ink-3">
              {winners.length} designs · {withArt} with artwork
            </span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          what already{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            sold in your world
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
      <div className="mb-7 flex flex-wrap items-center gap-3">
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
          <section key={g.keyword} className="mb-6">
            {/* ------------------------------------------------ the header */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b-2 border-black pb-2.5">
              <button
                onClick={() => toggle(g.keyword, i)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
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

              <span className="t-small shrink-0 text-ink-3">
                {g.list.length} designs · {money(g.revenue)} · {when(g.dated)}
              </span>
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
                  : !briefs[g.keyword]
                    ? "Show patterns"
                    : showing[g.keyword]
                      ? "Hide patterns"
                      : "Show patterns"}
              </button>
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
                stale={g.list.length !== briefs[g.keyword].counted}
              />
            )}

            {open && (
              <div className="mt-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {g.featured.map((w) => (
                    <Tile
                      key={w.id}
                      w={w}
                      big
                      crowned={g.crowned.has(w.id)}
                      flag={
                        w.id === g.established.id ? "most sales" : g.secondFlag
                      }
                      onDrop={() => drop(w)}
                    />
                  ))}
                </div>

                {g.rest.length > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {g.rest.map((w) => (
                      <Tile
                        key={w.id}
                        w={w}
                        crowned={g.crowned.has(w.id)}
                        onDrop={() => drop(w)}
                      />
                    ))}
                  </div>
                )}
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
 * One section of the brief: its name on the left, its findings on the right.
 *
 * The name is a real heading at a real size. It was an eleven pixel caps
 * label, which made the section titles the smallest type in the panel —
 * smaller than the body text they were introducing — so nothing on the screen
 * announced itself and the eye had nowhere to land.
 */
function Section({
  name,
  lead = false,
  quiet = false,
  points,
}: {
  name: string;
  /** The section the seller acts on. Bigger, and marked down the side. */
  lead?: boolean;
  /** Supporting detail. Deliberately recessive. */
  quiet?: boolean;
  points: BriefPoint[];
}) {
  if (!points.length) return null;
  return (
    <div className="grid gap-x-10 gap-y-3 border-t-2 border-black/10 py-7 first:border-t-0 first:pt-0 lg:grid-cols-[190px_minmax(0,1fr)]">
      <h3
        className={`shrink-0 leading-tight ${
          lead ? "t-h2 text-ink" : "text-[17px] font-bold text-ink-2"
        }`}
      >
        {name}
      </h3>

      <ul className={`max-w-[62ch] ${lead ? "space-y-5" : "space-y-4"}`}>
        {points.map((p, i) => (
          <li
            key={i}
            className={lead ? "border-l-2 pl-4" : ""}
            style={lead ? { borderColor: "var(--accent)" } : undefined}
          >
            <p
              className={
                lead
                  ? "text-[17px] font-bold leading-snug text-ink"
                  : "text-[15px] font-bold text-ink"
              }
            >
              {p.heading}
            </p>
            <p
              className={`mt-1 leading-relaxed ${
                quiet ? "t-small text-ink-3" : "text-[15px] text-ink-2"
              }`}
            >
              {p.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * ONE KEYWORD'S PATTERNS.
 *
 * Four earlier versions of this got it wrong in four ways, and the thread
 * through all of them was competition: too many things on screen at the same
 * visual weight, so the eye had nowhere to start.
 *
 * A two-by-two grid of equal sections made the reader do the ranking. Holding
 * the text to a reading measure fixed the line length and left half the panel
 * empty. Two parallel columns filled the panel and gave the eye two competing
 * places to begin. And the section names, set as eleven pixel caps, were the
 * smallest type on a screen of fifteen pixel body text, so nothing announced
 * itself at all.
 *
 * So it is one path, not a composition. Two sections stack, each with its
 * name in a fixed column on the left and its findings on the right. The eye
 * runs down the left edge and stops where it likes.
 *
 * Opportunities come first, because that is the part the seller is here for,
 * and they carry the accent down their side. Patterns follow as the evidence
 * underneath. There is no fold in here — the Show patterns button in the
 * group header is the fold.
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
  const b = stored.brief;

  return (
    <Card className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
        <p className="t-small text-ink-3">
          {stored.counted} designs under &ldquo;{keyword}&rdquo;
          {stale && " · the group has changed since this was read"}
        </p>
        <button onClick={onRead} className="btn btn-ghost" disabled={busy}>
          {stale ? "Read it again" : "Refresh"}
        </button>
      </div>

      <div className="mt-7">
        <Section name="Opportunities" lead points={b.opportunities} />
        <Section name="Patterns" points={b.patterns} />
      </div>
    </Card>
  );
}

/**
 * One design.
 *
 * Pink means exactly one thing on this page: this is a top five seller in its
 * keyword. The "most sales" and "winning now" flags used to be pink too, and
 * three pink things on one screen is no signal at all — they are labels, so
 * they are plain, and the colour is spent on the border you should be able to
 * spot from across the room.
 */
function Tile({
  w,
  big = false,
  flag,
  crowned = false,
  onDrop,
}: {
  w: Winner;
  big?: boolean;
  flag?: string;
  crowned?: boolean;
  onDrop: () => void;
}) {
  const rate = perDay(w);
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
      <div className="relative bg-black/[0.04]">
        {w.imageUrl ? (
          <img
            src={w.imageUrl}
            alt={w.design ?? w.title}
            loading="lazy"
            className={`w-full object-cover ${big ? "aspect-[4/3]" : "aspect-square"}`}
          />
        ) : (
          <div
            className={`flex items-center justify-center ${big ? "aspect-[4/3]" : "aspect-square"}`}
          >
            <span className="t-small text-ink-3">No picture</span>
          </div>
        )}
        {flag && (
          <span className="absolute left-3 top-3 rounded-full bg-black px-2.5 py-1 text-[11px] font-bold text-white">
            {flag}
          </span>
        )}
      </div>

      <figcaption className="p-3.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="numeral text-[1.15rem] text-ink">
            {w.sales.toLocaleString()}
          </span>
          <span className="t-small text-ink-2">sales</span>
          <span className="t-small font-bold text-ink">
            {rate.toFixed(1)}/day
          </span>
          <span className="t-small text-ink-3">{w.ageDays} days</span>
          <span className="t-small text-ink-3">${w.price.toFixed(2)}</span>
        </div>

        {w.design && big && (
          <p className="t-small mt-2 line-clamp-3 text-ink-2">{w.design}</p>
        )}

        <div className="t-small mt-2 flex items-center justify-between gap-3 text-ink-3">
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
