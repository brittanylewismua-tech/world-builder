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
  hideWinner,
  loadBrief,
  loadWinners,
  perDay,
  readExport,
  readTheWall,
  SOLD_AT_LEAST,
  type Brief,
  type StoredBrief,
  type Winner,
} from "@/lib/winners";

export default function WinnersPage() {
  return <Shell>{(world) => <WinnersBody world={world} />}</Shell>;
}

function WinnersBody({ world }: { world: World }) {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [stored, setStored] = useState<StoredBrief | null>(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState("");
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  /* null until an upload has reported back whether Etsy's key is in place. */
  const [keyed, setKeyed] = useState<boolean | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [w, b] = await Promise.all([
      loadWinners(world.id).catch(() => []),
      loadBrief(world.id).catch(() => null),
    ]);
    setWinners(w);
    setStored(b);
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

  async function read() {
    setReading(true);
    setErr("");
    setSaid("");
    try {
      await readTheWall(world);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      if (!msg.toLowerCase().includes("limit"))
        report("winners-read", e, { worldId: world.id });
      setErr(msg);
    } finally {
      setReading(false);
    }
  }

  /*
    Grouped by keyword, because that is how the files arrive and it is the one
    honest thing a keyword tells you: which search this design was winning.
    Biggest group first so the world's centre of gravity is at the top.
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
        const now = [...list].sort((a, b) => perDay(b) - perDay(a))[0];
        const featured =
          established.id === now.id ? [established] : [established, now];
        const rest = list
          .filter((w) => !featured.some((f) => f.id === w.id))
          .sort((a, b) => b.sales - a.sales);
        return { keyword, list, established, now, featured, rest };
      })
      .sort((a, b) => b.list.length - a.list.length);
  }, [winners]);

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
          disabled={!!uploading || reading}
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

      {reading && (
        <Card className="mb-7 flex flex-col items-center py-14 text-center">
          <img
            src="/globe.png"
            alt=""
            className="globe-turn h-14 w-14 opacity-80"
          />
          <p className="t-h3 mt-5 text-ink">Looking at the designs…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={70} />
          <p className="t-small mt-1.5 text-ink-3">About a minute.</p>
        </Card>
      )}

      {/* -------------------------------------------------------- brief */}
      {!reading && stored && (
        <BriefPanel
          stored={stored}
          onRead={read}
          busy={reading}
          stale={winners.length > stored.counted}
        />
      )}

      {!reading && !stored && withArt >= 4 && (
        <Card className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="t-h3 text-ink">Read the whole wall</p>
            <p className="t-small mt-1 text-ink-2">
              One look across every design here, not keyword by keyword.
            </p>
          </div>
          <button onClick={read} className="btn btn-accent">
            Read it
          </button>
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

      {groups.map((g) => (
        <section key={g.keyword} className="mb-10">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-black/15 pb-2">
            <h2 className="t-h2 text-ink">{g.keyword}</h2>
            <span className="t-small text-ink-3">{g.list.length} designs</span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {g.featured.map((w) => (
              <Tile
                key={w.id}
                w={w}
                big
                flag={
                  g.featured.length === 1
                    ? "biggest and fastest"
                    : w.id === g.established.id
                      ? "most sales"
                      : "winning now"
                }
                onHide={async () => {
                  await hideWinner(w.id);
                  refresh();
                }}
              />
            ))}
          </div>

          {g.rest.length > 0 && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {g.rest.map((w) => (
                <Tile
                  key={w.id}
                  w={w}
                  onHide={async () => {
                    await hideWinner(w.id);
                    refresh();
                  }}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function BriefPanel({
  stored,
  onRead,
  busy,
  stale,
}: {
  stored: StoredBrief;
  onRead: () => void;
  busy: boolean;
  stale: boolean;
}) {
  const b = stored.brief;
  const parts: [string, Brief["moves"]][] = [
    ["What this world buys", b.moves],
    ["Where the hole is", b.gaps],
    ["Still moving", b.alive],
    ["Worn out", b.worn],
  ];

  return (
    <Card className="mb-9">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
        <p className="t-small text-ink-3">
          Read across {stored.counted} designs
        </p>
        <button onClick={onRead} className="btn btn-ghost" disabled={busy}>
          {stale ? "Read it again" : "Refresh"}
        </button>
      </div>

      <div className="grid gap-7 lg:grid-cols-2">
        {parts
          .filter(([, list]) => list.length > 0)
          .map(([title, list]) => (
            <div key={title}>
              <h3 className="t-h3 text-ink">{title}</h3>
              <span className="rule-accent mt-2" />
              <ul className="mt-3 space-y-3.5">
                {list.map((p, i) => (
                  <li key={i}>
                    <p className="text-[15px] font-bold text-ink">{p.heading}</p>
                    <p className="t-small mt-0.5 text-ink-2">{p.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </Card>
  );
}

function Tile({
  w,
  big = false,
  flag,
  onHide,
}: {
  w: Winner;
  big?: boolean;
  flag?: string;
  onHide: () => void;
}) {
  const rate = perDay(w);
  return (
    <figure className="card overflow-hidden">
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
          <span
            className="absolute left-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
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
            onClick={onHide}
            className="shrink-0 transition hover:text-ink"
          >
            Remove
          </button>
        </div>
      </figcaption>
    </figure>
  );
}
