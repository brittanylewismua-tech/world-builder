/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { Page, Card, Empty, ErrorNote, Rich } from "@/components/ui";
import ReadingBar from "@/components/ReadingBar";
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

export default function ShopsPage() {
  return <Shell>{(world) => <ShopsBody world={world} />}</Shell>;
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
          who already{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            built your world
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

  async function run(kind: "patterns" | "buyers") {
    setBusy(kind);
    onError("");
    try {
      await readShop(world, shop.id, kind);
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
          drop={drop}
          shopName={shop.name}
          world={world}
          onRead={() => run(showing)}
        />
      )}

      {open && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
            <p className="t-small text-ink-3">Order by</p>
            {(
              [
                ["rate", "how often it's favorited"],
                ["favorites", "most favorites"],
                ["views", "most views"],
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
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className="numeral text-[1rem]"
                      style={{ color: "var(--accent)" }}
                    >
                      {d.views >= ENOUGH_VIEWS
                        ? `${(100 * saveRate(d)).toFixed(0)}%`
                        : "—"}
                    </span>
                    <span className="t-small text-ink-2">favorited it</span>
                  </p>
                  <p className="t-small mt-0.5 text-ink-3">
                    {d.views.toLocaleString()} views ·{" "}
                    {d.favorers.toLocaleString()} favorites
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
  drop,
  shopName,
  world,
  onRead,
}: {
  read: ShopRead;
  designs: ShopDesign[];
  drop: Drop | null;
  shopName: string;
  world: World;
  onRead: () => void;
}) {
  const [at, setAt] = useState(0);
  const [kept, setKept] = useState<Record<number, boolean>>({});
  useEffect(() => setAt(0), [read]);

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
        </p>
        <button onClick={onRead} className="btn btn-ghost">
          Refresh
        </button>
      </div>

      <div className="mt-6 max-w-[64ch]">
        <div
          className="flex min-h-[168px] flex-col justify-center border-l-2 pl-5"
          style={{ borderColor: "var(--accent)" }}
        >
          <p className="t-h3 leading-snug text-ink">{p.heading}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
            {p.body}
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
                    <Rich text={line} />
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
