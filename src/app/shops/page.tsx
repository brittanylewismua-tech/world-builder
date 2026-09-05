/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { NeedsSetupPage, needsSetup } from "@/components/NeedsSetup";
import { Page, Card, Empty, ErrorNote } from "@/components/ui";
import ReadingBar from "@/components/ReadingBar";
import Left, { spent } from "@/components/Left";
import { report } from "@/lib/report";
import { saveFindingToBoard } from "@/lib/board";
import { splitDrops, syncSchedule, type Drop } from "@/lib/drops";
import type { World } from "@/lib/world";
import {
  addShop,
  ENOUGH_VIEWS,
  loadDesigns,
  loadShopReads,
  loadShops,
  MOST_SHOPS,
  readShop,
  removeShop,
  saveRate,
  type Shop,
  type ShopDesign,
  type ShopPoint,
  type ShopRead,
} from "@/lib/shops";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/* ------------------------------------------------ naming a design in prose

  The brief quotes designs by name — "Nurse Embroidered Sweatshirt leads the
  shop with 293,297 views". A named design should be openable, because the
  next thing a seller wants after reading a claim is to look at the thing.

  Etsy titles are enormous and stuffed with keywords, so the model always
  writes a shortened version — nearly always the opening words. So designs
  are filed under their first three words, and a run of text that starts with
  those three words is extended along the title for as far as it agrees.
*/

type Named = { words: string[]; url: string; title: string };
/** Designs filed by their first three words, and again by their first two. */
export type TitleIndex = { three: Map<string, Named[]>; two: Map<string, Named[]> };

const wordsIn = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

function titleIndex(designs: ShopDesign[]): TitleIndex {
  const three = new Map<string, Named[]>();
  const two = new Map<string, Named[]>();
  for (const d of designs) {
    if (!d.url) continue;
    const words = wordsIn(d.title);
    if (words.length < 2) continue;
    const entry = { words, url: d.url, title: d.title };
    /* Designs arrive most-favorited first, so the first one wins ties. */
    const file = (map: Map<string, Named[]>, key: string) => {
      const held = map.get(key);
      if (held) held.push(entry);
      else map.set(key, [entry]);
    };
    file(two, words.slice(0, 2).join(" "));
    if (words.length >= 3) file(three, words.slice(0, 3).join(" "));
  }
  return { three, two };
}

/*
  Two words is far too loose to go hunting for inside a sentence — "ghost
  sweatshirt" is ordinary English here. But the model puts the name of a
  design in bold, so when a whole bold run is exactly the opening of a title,
  two words is enough and "Auntie Sweatshirt" becomes a link.
*/
function boldIsATitle(text: string, index: TitleIndex): Named | null {
  const words = wordsIn(text);
  if (words.length < 2 || text.length < 12) return null;
  for (const cand of index.two.get(`${words[0]} ${words[1]}`) ?? []) {
    if (words.length > cand.words.length) continue;
    if (words.every((w, i) => cand.words[i] === w)) return cand;
  }
  return null;
}

type Piece = { text: string; url?: string; title?: string };

function linkTitles(text: string, index: TitleIndex): Piece[] {
  const found = [...text.matchAll(/[A-Za-z0-9]+/g)];
  if (found.length < 3) return [{ text }];
  const tok = found.map((m) => ({
    w: m[0].toLowerCase(),
    from: m.index as number,
    to: (m.index as number) + m[0].length,
  }));

  const out: Piece[] = [];
  let cut = 0; // how much of the original string is already spent
  let i = 0;

  while (i + 2 < tok.length) {
    const runners = index.three.get(
      `${tok[i].w} ${tok[i + 1].w} ${tok[i + 2].w}`,
    );
    if (!runners) {
      i++;
      continue;
    }

    /* Take whichever design agrees with the line for longest. */
    let best: Named | null = null;
    let far = 0;
    for (const cand of runners) {
      let n = 3;
      while (n < cand.words.length && tok[i + n]?.w === cand.words[n]) n++;
      if (n > far) {
        far = n;
        best = cand;
      }
    }
    if (!best) {
      i++;
      continue;
    }

    const from = tok[i].from;
    const to = tok[i + far - 1].to;
    /* Too short to be a name, or straddling a bold marker: leave it alone. */
    if (to - from < 12) {
      i++;
      continue;
    }

    if (from > cut) out.push({ text: text.slice(cut, from) });
    out.push({ text: text.slice(from, to), url: best.url, title: best.title });
    cut = to;
    i += far;
  }

  if (cut < text.length) out.push({ text: text.slice(cut) });
  return out.length ? out : [{ text }];
}

/** A line of the brief: bold first, then any design named inside it. */
function Line({ text, index }: { text: string; index: TitleIndex }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*)/g)
        .filter(Boolean)
        .map((run, i) => {
          const strong = run.startsWith("**") && run.endsWith("**");
          const inner = strong ? run.slice(2, -2) : run;
          const whole = strong ? boldIsATitle(inner, index) : null;
          const pieces: Piece[] = whole
            ? [{ text: inner, url: whole.url, title: whole.title }]
            : linkTitles(inner, index);
          const body = pieces.map((p, j) =>
            p.url ? (
              <a
                key={j}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                title={p.title}
                className="underline decoration-2 underline-offset-2 transition hover:opacity-70"
                style={{ textDecorationColor: "var(--accent)" }}
              >
                {p.text}
              </a>
            ) : (
              <span key={j}>{p.text}</span>
            ),
          );
          return strong ? (
            <strong key={i} className="font-bold text-ink">
              {body}
            </strong>
          ) : (
            <span key={i}>{body}</span>
          );
        })}
    </>
  );
}

/* ------------------------------------------------------------------ */

export default function ShopsPage() {
  return (
    <Shell>
      {(world) =>
        /* Open to walk into, closed to work in — see NeedsSetup. */
        needsSetup(world) ? (
          <NeedsSetupPage world={world} what="World Shops" width="full" />
        ) : (
          <ShopsBody world={world} />
        )
      }
    </Shell>
  );
}

function ShopsBody({ world }: { world: World }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [reads, setReads] = useState<
    Record<string, Partial<Record<"patterns" | "buyers", ShopRead>>>
  >({});
  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [said, setSaid] = useState("");
  /* Where a finding goes when the seller wants to keep it. */
  const [drop, setDrop] = useState<Drop | null>(null);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    syncSchedule(world)
      .then((all) => setDrop(splitDrops(all).next))
      .catch(() => setDrop(null));
  }, [world]);

  const refresh = useCallback(async () => {
    const [s, r] = await Promise.all([
      loadShops(world.id).catch(() => []),
      loadShopReads(world.id).catch(() => ({})),
    ]);
    setShops(s);
    setReads(r);
    setReady(true);
  }, [world.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function add() {
    const value = input.trim();
    if (!value) return;
    setAdding(true);
    setErr("");
    setSaid("");
    try {
      const res = await addShop(world, value);
      setInput("");
      spent(); // a slot just went; the count beside the button is now stale
      await refresh();
      setSaid(`${res.shopName} — ${res.designs} designs.`);
    } catch (e) {
      report("shops", e, { worldId: world.id });
      setErr(e instanceof Error ? e.message : "That shop did not come down.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Page width="full">
      <header className="mb-12 border-b-2 border-black pb-6">
        <div className="flex items-baseline justify-between gap-4">
          <span className="chip chip-solid">world shops</span>
          {shops.length > 0 && (
            <span className="t-small text-ink-3">
              {shops.length} of {MOST_SHOPS}
            </span>
          )}
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          shops already{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            selling to your customer
          </span>
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {err && <ErrorNote>{err}</ErrorNote>}

      {/* ---------------------------------------------------------- add */}
      {shops.length < MOST_SHOPS && (
        <div className="mb-16 flex flex-wrap items-center gap-3">
          <input
            ref={box}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="etsy.com/shop/TheirShopName"
            className="min-w-[280px] flex-1 rounded-lg border-2 border-black px-3.5 py-2.5 text-[15px] outline-none"
            disabled={adding}
          />
          <button onClick={add} className="btn btn-accent" disabled={adding}>
            {adding ? "Pulling the shop…" : "Follow this shop"}
          </button>
          {said && !adding && (
            <span className="t-small text-ink-2">{said}</span>
          )}
          {/*
            Following a shop is the one capped action here somebody can walk
            into unawares — five a week, and removing one to make room still
            costs a slot. Better said beside the button than after it.
          */}
          <Left route="shopAdds" className="w-full" />
        </div>
      )}

      {adding && (
        <Card className="mb-16 flex flex-col items-center py-12 text-center">
          <img
            src="/globe.png"
            alt=""
            className="globe-turn h-12 w-12 opacity-80"
          />
          <p className="t-h3 mt-4 text-ink">Getting their designs…</p>
          <ReadingBar className="mt-4 max-w-xs" expect={45} />
        </Card>
      )}

      {ready && !shops.length && !adding && (
        <Empty
          title="No shops yet"
          body="Find a shop already selling to the customer you are building for, and paste its address."
          action={
            <button onClick={() => box.current?.focus()} className="btn btn-accent">
              Paste a shop
            </button>
          }
        />
      )}

      {shops.map((s) => (
        <ShopBlock
          key={s.id}
          world={world}
          drop={drop}
          shop={s}
          reads={reads[s.id] ?? {}}
          onChanged={refresh}
          onError={setErr}
        />
      ))}
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function ShopBlock({
  world,
  drop,
  shop,
  reads,
  onChanged,
  onError,
}: {
  world: World;
  drop: Drop | null;
  shop: Shop;
  reads: Partial<Record<"patterns" | "buyers", ShopRead>>;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const [designs, setDesigns] = useState<ShopDesign[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "patterns" | "buyers">("");
  const [showing, setShowing] = useState<"" | "patterns" | "buyers">("");
  const [pulling, setPulling] = useState(false);
  const [all, setAll] = useState(false);
  /*
    Favourite rate is the default because it is the thing you cannot see on
    Etsy. But a seller sometimes wants the plain hits, or what the shop has
    put out lately, so the order is theirs to change.
  */
  const [order, setOrder] = useState<"rate" | "favorites" | "views">("rate");

  /* The love map needs these, and so do the thumbnails under a finding. */
  useEffect(() => {
    if ((!open && !showing) || designs) return;
    loadDesigns(shop.id)
      .then(setDesigns)
      .catch(() => setDesigns([]));
  }, [open, showing, designs, shop.id]);

  /*
    A second read only earns its cost if the evidence underneath it has
    changed, so reading again pulls the catalogue down first. Etsy's numbers
    move every day and the pull is free; it is the read that is rationed.
  */
  async function run(kind: "patterns" | "buyers", fresh = false) {
    setBusy(kind);
    onError("");
    try {
      if (fresh) {
        /*
          Best effort. If Etsy was already asked today the pull is refused,
          and that is fine — the catalogue on file is current. It must not
          stop the read the seller actually pressed.
        */
        await addShop(world, shop.name).catch(() => {});
        setDesigns(null);
      }
      await readShop(world, shop.id, kind);
      spent();
      await onChanged();
      setShowing(kind);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That did not finish.";
      if (!msg.toLowerCase().includes("limit"))
        report("shops", e, { worldId: world.id, shopId: shop.id, kind });
      onError(msg);
    } finally {
      setBusy("");
    }
  }

  /*
    Ranked by the share of viewers who favorited it, not by traffic. That is the
    whole point of having Etsy's real numbers: a shop's biggest traffic
    getter is routinely not the design people wanted.
  */
  /* So the brief can turn a design it names into a link to that design. */
  const named = useMemo(() => titleIndex(designs ?? []), [designs]);

  /*
    How much of this shop is even about the world being built. Etsy shops are
    almost never one world, and knowing a shop is a fifth yours is the thing
    that tells a seller whether it is worth following at all.
  */
  const split = useMemo(() => {
    if (!designs?.length) return null;
    const n = { core: 0, near: 0, other: 0 };
    for (const d of designs) {
      const b = d.relevance ?? "near";
      n[b as "core" | "near" | "other"]++;
    }
    return n.core || n.other ? n : null;
  }, [designs]);

  const loved = designs
    ? [...designs].sort((a, b) =>
        order === "favorites"
          ? b.favorers - a.favorers
          : order === "views"
            ? b.views - a.views
            : saveRate(b) - saveRate(a),
      )
    : [];

  return (
    <section className="mb-28">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b-2 border-black pb-4">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <span
            className="shrink-0 text-ink-3 transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
            aria-hidden
          >
            ▶
          </span>
          {/*
            The shop's own mark, which Etsy sends with everything else about
            them and which was being thrown away. A column of names is a list;
            a column of names with the businesses' own faces beside them is
            recognisably the set of shops this seller decided to study.

            Older rows have no icon until their next pull, so the name simply
            stands alone rather than leaving a hole where a picture should be.
          */}
          {shop.iconUrl && (
            <img
              src={shop.iconUrl}
              alt=""
              loading="lazy"
              className="h-8 w-8 shrink-0 rounded-full border-2 border-black object-cover"
            />
          )}
          <h2 className="t-h2 truncate text-ink">{shop.name}</h2>
        </button>

        <span className="h-6 w-px shrink-0 bg-black/20" aria-hidden />

        <button
          onClick={() =>
            reads.patterns && showing !== "patterns"
              ? setShowing("patterns")
              : reads.patterns
                ? setShowing("")
                : run("patterns")
          }
          className="btn btn-ghost shrink-0"
          disabled={!!busy}
        >
          {busy === "patterns"
            ? "Reading…"
            : showing === "patterns"
              ? "Hide patterns"
              : "Their patterns"}
        </button>
        <button
          onClick={() =>
            reads.buyers && showing !== "buyers"
              ? setShowing("buyers")
              : reads.buyers
                ? setShowing("")
                : run("buyers")
          }
          className="btn btn-ghost shrink-0"
          disabled={!!busy}
        >
          {busy === "buyers"
            ? "Reading…"
            : showing === "buyers"
              ? "Hide buyers"
              : "Their buyers"}
        </button>

        <span className="flex-1" />

        <span className="t-small shrink-0 text-ink-3">
          {shop.listingCount?.toLocaleString()} designs
          {shop.soldCount ? ` · ${shop.soldCount.toLocaleString()} sales` : ""}
          {shop.reviewCount
            ? ` · ${shop.reviewCount.toLocaleString()} reviews`
            : ""}
        </span>
        {/*
          How much of this shop is even yours. Etsy shops are almost never
          one world, and a shop that is a fifth yours is a different
          proposition from one that is all of it.
        */}
        {split && (
          <span
            className="t-small shrink-0 text-ink-3"
            title={`${split.core} in your world · ${split.near} next door · ${split.other} about something else`}
          >
            {Math.round(
              (100 * (split.core + split.near)) /
                (split.core + split.near + split.other),
            )}
            % in your world
          </span>
        )}
        {shop.url && (
          <a
            href={shop.url}
            target="_blank"
            rel="noopener noreferrer"
            className="t-small shrink-0 text-ink-3 transition hover:text-ink"
          >
            On Etsy ↗
          </a>
        )}
        {/*
          Views and favourites move. Re-pasting the address worked but
          nobody would guess it, so the shop says when it was last pulled
          and offers to do it again.
        */}
        <span className="t-small shrink-0 text-ink-3">
          {when(shop.refreshedAt)}
        </span>
        <button
          onClick={async () => {
            setPulling(true);
            onError("");
            try {
              await addShop(world, shop.name);
              setDesigns(null);
              await onChanged();
            } catch (e) {
              onError(
                e instanceof Error ? e.message : "That did not refresh.",
              );
            } finally {
              setPulling(false);
            }
          }}
          className="t-small shrink-0 text-ink-3 transition hover:text-ink"
          disabled={pulling}
        >
          {pulling ? "Refreshing…" : "Refresh"}
        </button>
        <button
          onClick={async () => {
            if (!confirm(`Stop following ${shop.name}?`)) return;
            await removeShop(shop.id);
            onChanged();
          }}
          className="t-small shrink-0 text-ink-3 transition hover:text-ink"
        >
          Remove
        </button>
      </div>

      {busy && (
        <Card className="mt-6 flex flex-col items-center py-12 text-center">
          <img
            src="/globe.png"
            alt=""
            className="globe-turn h-12 w-12 opacity-80"
          />
          <p className="t-h3 mt-4 text-ink">
            {busy === "patterns"
              ? "Looking at their designs…"
              : "Reading what buyers said…"}
          </p>
          <ReadingBar className="mt-4 max-w-xs" expect={45} />
        </Card>
      )}

      {!busy && showing && reads[showing] && (
        <Brief
          read={reads[showing] as ShopRead}
          designs={designs ?? []}
          named={named}
          drop={drop}
          shopName={shop.name}
          world={world}
          onRead={() => run(showing, true)}
        />
      )}

      {open && (
        <>
          {/*
            These three are easy to confuse, so the words say plainly which
            is a share and which are counts, and the big number on every card
            changes with the choice. Sorting that appears to do nothing is
            worse than no sorting.
          */}
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="t-small text-ink-3">Order by</p>
            {(
              [
                ["rate", "% of viewers who favorited it"],
                ["favorites", "total favorites"],
                ["views", "total views"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setOrder(key)}
                className="t-small transition"
                style={
                  order === key
                    ? { color: "var(--accent)", fontWeight: 700 }
                    : { color: "rgba(0,0,0,0.5)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <p className="t-small mt-2 max-w-[62ch] text-ink-3">
            {order === "rate"
              ? "Out of everyone who saw it. A design seen 300 times and favorited 60 times beats one seen 30,000 times and favorited 900 — the first one is what people actually wanted."
              : order === "favorites"
                ? "The plain count of hearts. Big numbers here usually mean the design got a lot of traffic, not that it landed."
                : "How many times Etsy put it in front of someone. Traffic, not wanting."}
          </p>
          <div className="mt-4 grid gap-6 sm:grid-cols-3 lg:grid-cols-5">
            {loved.slice(0, all ? loved.length : 40).map((d) => (
              <figure key={d.listingId} className="card overflow-hidden">
                <a href={d.url ?? "#"} target="_blank" rel="noopener noreferrer">
                  {d.imageUrl ? (
                    <img
                      src={d.imageUrl}
                      alt={d.title}
                      loading="lazy"
                      className="aspect-square w-full bg-black/[0.04] object-cover"
                    />
                  ) : (
                    <span className="flex aspect-square items-center justify-center bg-black/[0.04]">
                      <span className="t-small text-ink-3">No picture</span>
                    </span>
                  )}
                </a>
                <figcaption className="p-4">
                  {/* The number they sorted by leads; the others follow. */}
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="numeral text-[1rem]"
                      style={{ color: "var(--accent)" }}
                    >
                      {order === "favorites"
                        ? d.favorers.toLocaleString()
                        : order === "views"
                          ? d.views.toLocaleString()
                          : d.views >= ENOUGH_VIEWS
                            ? `${(100 * saveRate(d)).toFixed(0)}%`
                            : "—"}
                    </span>
                    <span className="t-small text-ink-2">
                      {order === "favorites"
                        ? "favorites"
                        : order === "views"
                          ? "views"
                          : "favorited it"}
                    </span>
                  </p>
                  <p className="t-small mt-0.5 text-ink-3">
                    {order === "rate"
                      ? `${d.views.toLocaleString()} views · ${d.favorers.toLocaleString()} favorites`
                      : order === "favorites"
                        ? `${d.views.toLocaleString()} views · ${
                            d.views >= ENOUGH_VIEWS
                              ? `${(100 * saveRate(d)).toFixed(0)}% favorited it`
                              : "too few views to rate"
                          }`
                        : `${d.favorers.toLocaleString()} favorites · ${
                            d.views >= ENOUGH_VIEWS
                              ? `${(100 * saveRate(d)).toFixed(0)}% favorited it`
                              : "too few views to rate"
                          }`}
                  </p>
                  <p className="t-small mt-1.5 line-clamp-2 text-ink-2">
                    {d.title}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
          {loved.length > 40 && (
            <div className="mt-6">
              <button onClick={() => setAll((v) => !v)} className="btn btn-ghost">
                {all
                  ? "Show the first 40"
                  : `Show all ${loved.length} designs`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Brief({
  read,
  designs,
  named,
  drop,
  shopName,
  world,
  onRead,
}: {
  read: ShopRead;
  designs: ShopDesign[];
  named: TitleIndex;
  drop: Drop | null;
  shopName: string;
  world: World;
  onRead: () => void;
}) {
  const [at, setAt] = useState(0);
  const [kept, setKept] = useState<Record<number, boolean>>({});
  useEffect(() => setAt(0), [read]);

  /* Null once the week is up. Mirrors the same rule on the server. */
  const opens = (() => {
    const d = new Date(read.ranAt);
    d.setDate(d.getDate() + 7);
    return Date.now() < d.getTime() ? d : null;
  })();

  const points: ShopPoint[] = read.patterns;
  if (!points.length) return null;
  const p = points[Math.min(at, points.length - 1)];
  const last = points.length - 1;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-black pb-3">
        <p className="t-small text-ink-3">
          {read.kind === "patterns"
            ? "What this shop keeps doing"
            : "What their buyers said"}
          <span className="text-ink-3"> · read {when(read.ranAt)}</span>
        </p>
        {/*
          Worth pressing when the shop has been publishing — it pulls their
          latest listings and Etsy's newest numbers, then reads again. Closed
          for a week afterwards, and the button says so rather than letting
          somebody spend a read to be told no.
        */}
        {opens ? (
          <span className="t-small text-ink-3">
            Can be read again {when(opens.toISOString())}
          </span>
        ) : (
          <>
            <button
              onClick={onRead}
              className="btn btn-ghost"
              title="Pulls their newest listings and numbers, then reads the shop again"
            >
              Read again
            </button>
            <Left route="shops" />
          </>
        )}
      </div>

      <div className="mt-6 max-w-[64ch]">
        <div
          className="flex min-h-[168px] flex-col justify-center border-l-2 pl-5"
          style={{ borderColor: "var(--accent)" }}
        >
          <p className="t-h3 leading-snug text-ink">{p.heading}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            <Line text={p.body} index={named} />
          </p>
          {/* The evidence, a line each. */}
          {p.points && p.points.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {p.points.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-2.5 text-[15px] leading-relaxed text-ink-2"
                >
                  <span
                    className="mt-[7px] h-1 w-1 shrink-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                    aria-hidden
                  />
                  <span>
                    <Line text={line} index={named} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/*
            The designs the finding is about. A claim about how something
            looks should be checkable by looking.
          */}
          {p.examples && p.examples.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {p.examples
                .map((id) => designs.find((d) => d.listingId === id))
                .filter((d): d is ShopDesign => !!d?.imageUrl)
                .map((d) => (
                  <a
                    key={d.listingId}
                    href={d.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={d.title}
                  >
                    <img
                      src={d.imageUrl as string}
                      alt={d.title}
                      loading="lazy"
                      className="h-20 w-20 rounded border border-black/15 object-cover transition hover:border-black"
                    />
                  </a>
                ))}
            </div>
          )}

          {p.quote && (
            <blockquote className="mt-3 border-l-2 border-black/20 pl-3 text-[14px] italic leading-relaxed text-ink-2">
              &ldquo;{p.quote}&rdquo;
            </blockquote>
          )}
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
          {/*
            Everything else in this app feeds the drop board; this page was a
            dead end. A finding is the seller's own note about what works, so
            it can go straight to the drop they are building.
          */}
          {drop && (
            <button
              onClick={async () => {
                if (kept[at]) return;
                await saveFindingToBoard(world, drop, {
                  headline: p.heading,
                  body: p.body.replace(/\*\*/g, ""),
                  source: `From ${shopName}`,
                });
                setKept((k) => ({ ...k, [at]: true }));
              }}
              className="btn btn-ghost"
              title={`From ${shopName}`}
            >
              {kept[at] ? `Kept → Drop ${drop.number}` : "Keep this"}
            </button>
          )}
          <button
            onClick={() => setAt((n) => Math.max(0, n - 1))}
            className="btn btn-ghost"
            disabled={at === 0}
            aria-label="Previous"
          >
            ←
          </button>
          <button
            onClick={() => setAt((n) => Math.min(last, n + 1))}
            className="btn btn-ghost"
            disabled={at >= last}
            aria-label="Next"
          >
            →
          </button>
        </div>
      </div>
    </Card>
  );
}
