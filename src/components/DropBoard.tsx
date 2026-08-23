"use client";

import { useEffect, useRef, useState } from "react";
import type { World } from "@/lib/world";
import { formatDropDate, type Drop, type DropItem } from "@/lib/drops";

/**
 * SPEC: "It loosely simulates the visual experience of looking at products
 *        together inside an Etsy shop. It is not pretending to predict Etsy
 *        performance. It is a creative visualization workspace."
 */

const BACKGROUNDS = [
  { hex: "#FFFFFF", name: "White" },
  { hex: "#FAF9F8", name: "Paper" },
  { hex: "#FBF6EC", name: "Ivory" },
  { hex: "#F8E4EC", name: "Pale pink" },
  { hex: "#E8EDE9", name: "Sage" },
  { hex: "#1A1A1C", name: "Charcoal" },
];

/** Deterministic banner colour from the world name, so it feels intentional. */
function bannerColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 32% 16%)`;
}

export function ShopBanner({
  world,
  onUpload,
}: {
  world: World;
  onUpload?: (file: File) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f || !onUpload) return;
    setBusy(true);
    await onUpload(f);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="group relative">
      {world.shopBannerSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={world.shopBannerSrc}
          alt=""
          className="h-24 w-full object-cover sm:h-32"
        />
      ) : (
        <div
          className="flex h-24 w-full items-center justify-center sm:h-32"
          style={{ background: bannerColor(world.name || "world") }}
        >
          <span className="px-6 text-center text-[clamp(1.25rem,3vw,2rem)] font-extrabold tracking-tight text-white/95">
            {world.name || "Your Shop"}
          </span>
          {!world.shopBannerSrc && onUpload && (
            <span className="absolute bottom-2.5 left-3 text-[11.5px] text-white/70">
              Add the shop banner customers will see with this drop.
            </span>
          )}
        </div>
      )}

      {onUpload && (
        <>
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="absolute bottom-2.5 right-2.5 rounded-lg border-2 border-black bg-white px-2.5 py-1 text-[11.5px] font-bold text-black shadow-[2px_2px_0_#000] transition hover:translate-x-[-1px] hover:translate-y-[-1px]"
          >
            {busy
              ? "Uploading…"
              : world.shopBannerSrc
                ? "Change banner"
                : "Add shop banner"}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            onChange={(e) => pick(e.target.files)}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}

function Tile({
  slot,
  item,
  frozen,
  dark,
  onUpload,
  onRemove,
  onRename,
  onDropOn,
  dragging,
  setDragging,
  total,
}: {
  slot: number;
  item?: DropItem;
  frozen: boolean;
  dark: boolean;
  onUpload: (slot: number, file: File) => Promise<void>;
  onRemove: (item: DropItem) => Promise<void>;
  onRename: (item: DropItem, title: string) => Promise<void>;
  onDropOn: (from: number, to: number) => Promise<void>;
  dragging: number | null;
  setDragging: (n: number | null) => void;
  /** Highest slot number, so the last tile cannot move further right. */
  total: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState(item?.title ?? "");

  // The board can reorder underneath this tile, so follow the item.
  useEffect(() => setTitle(item?.title ?? ""), [item?.id, item?.title]);

  const canDrop = !frozen && dragging !== null && dragging !== slot;
  const dropProps = frozen
    ? {}
    : {
        onDragOver: (e: React.DragEvent) => {
          if (dragging === null || dragging === slot) return;
          e.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: async (e: React.DragEvent) => {
          e.preventDefault();
          setOver(false);
          const from = Number(e.dataTransfer.getData("text/plain"));
          setDragging(null);
          if (Number.isFinite(from)) await onDropOn(from, slot);
        },
      };

  const ring = over && canDrop ? "ring-2 ring-accent ring-offset-2" : "";

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    await onUpload(slot, f);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  const bar = dark ? "bg-white/14" : "bg-black/8";
  const barFaint = dark ? "bg-white/7" : "bg-black/5";

  if (item) {
    return (
      <div className="group" {...dropProps}>
        <div
          draggable={!frozen}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(slot));
            e.dataTransfer.effectAllowed = "move";
            setDragging(slot);
          }}
          onDragEnd={() => setDragging(null)}
          className={`relative aspect-square overflow-hidden rounded-xl transition ${ring} ${
            frozen ? "" : "cursor-grab active:cursor-grabbing"
          } ${dragging === slot ? "opacity-40" : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.src} alt="" className="h-full w-full object-cover" />
          <span className="absolute left-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10.5px] font-bold text-white">
            {String(slot).padStart(2, "0")}
          </span>
          {!frozen && (
            /*
              Dragging is the quick way, not the only way. Reordering by mouse
              alone would mean anyone who cannot drag — a trackpad they fight
              with, a tremor, a keyboard — simply cannot arrange their own
              drop. The arrows do the same job and are reachable by tab.

              focus-within matters as much as hover: buttons hidden at zero
              opacity are still in the tab order, so without it a keyboard
              user lands on controls they cannot see.
            */
            <div className="absolute inset-x-0 bottom-0 flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                onClick={() => onDropOn(slot, slot - 1)}
                disabled={slot === 1}
                className="bg-black/80 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-black disabled:opacity-30"
                aria-label={`Move this design to slot ${slot - 1}`}
              >
                ←
              </button>
              <button
                onClick={() => input.current?.click()}
                className="flex-1 border-l border-white/25 bg-black/80 py-1.5 text-[11px] font-medium text-white hover:bg-black"
                aria-label={`Replace the design in slot ${slot}`}
              >
                Replace
              </button>
              <button
                onClick={() => onRemove(item)}
                className="flex-1 border-l border-white/25 bg-black/80 py-1.5 text-[11px] font-medium text-white hover:bg-black"
                aria-label={`Remove the design in slot ${slot}`}
              >
                Remove
              </button>
              <button
                onClick={() => onDropOn(slot, slot + 1)}
                disabled={slot === total}
                className="border-l border-white/25 bg-black/80 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-black disabled:opacity-30"
                aria-label={`Move this design to slot ${slot + 1}`}
              >
                →
              </button>
            </div>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          onChange={(e) => pick(e.target.files)}
          className="hidden"
        />
        {/*
          The grey bars were always standing in for a listing's title. One of
          them is now the real thing, editable in place — the column has
          existed since the first migration with nothing able to write to it.
        */}
        {frozen ? (
          <p className={`mt-2 truncate text-[12px] font-semibold ${dark ? "text-white/80" : "text-ink-2"}`}>
            {item.title || `Design ${String(slot).padStart(2, "0")}`}
          </p>
        ) : (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== (item.title ?? "") && onRename(item, title)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            placeholder="Name this design"
            aria-label={`Name for the design in slot ${slot}`}
            className={`mt-2 w-full truncate rounded-md bg-transparent px-1 py-0.5 text-[12px] font-semibold outline-none transition placeholder:font-normal ${
              dark
                ? "text-white/85 placeholder:text-white/35 hover:bg-white/10 focus:bg-white/10"
                : "text-ink placeholder:text-ink-3 hover:bg-black/5 focus:bg-black/5"
            }`}
          />
        )}
        <div className={`mt-1 h-2 w-1/3 rounded-sm ${bar}`} />
      </div>
    );
  }

  return (
    <div {...dropProps} className={over && canDrop ? "rounded-xl ring-2 ring-accent ring-offset-2" : ""}>
      {/*
        An empty slot has to say what it wants. Ten numbered squares with an
        invisible file input behind them look like placeholders, and clicking
        one appeared to do nothing at all.
      */}
      <button
        onClick={() => !frozen && input.current?.click()}
        disabled={frozen || busy}
        aria-label={`Add a design to slot ${slot}`}
        className={`flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed transition disabled:cursor-default disabled:opacity-40 ${
          dark
            ? "border-white/25 text-white/45 hover:border-white/60 hover:bg-white/5"
            : "border-black/20 text-black/45 hover:border-black hover:bg-black/[0.03]"
        }`}
      >
        {busy ? (
          <span className="pulse-soft text-[13px] font-semibold">Uploading…</span>
        ) : (
          <>
            <span className="text-[15px] font-extrabold tracking-tight opacity-45">
              {String(slot).padStart(2, "0")}
            </span>
            {!frozen && (
              <>
                <span className="text-[17px] leading-none">↑</span>
                <span className="text-[12px] font-semibold">Add design</span>
                <span className="text-[10.5px] opacity-60">PNG or JPG</span>
              </>
            )}
          </>
        )}
      </button>
      <div className={`mt-2 h-2 w-4/5 rounded-sm ${barFaint}`} />
      <div className={`mt-1 h-2 w-1/3 rounded-sm ${barFaint}`} />
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={(e) => pick(e.target.files)}
        className="hidden"
      />
    </div>
  );
}

export default function DropBoard({
  world,
  drop,
  frozen = false,
  onUploadMockup,
  onRemoveMockup,
  onRenameMockup,
  onMoveMockup,
  onUploadBanner,
  onBackground,
}: {
  world: World;
  drop: Drop;
  frozen?: boolean;
  onUploadMockup: (slot: number, file: File) => Promise<void>;
  onRemoveMockup: (item: DropItem) => Promise<void>;
  onRenameMockup?: (item: DropItem, title: string) => Promise<void>;
  onMoveMockup?: (from: number, to: number) => Promise<void>;
  onUploadBanner?: (file: File) => Promise<void>;
  onBackground?: (hex: string) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const slots = Array.from({ length: world.slotsPerDrop }, (_, i) => i + 1);
  const bySlot = new Map(drop.items.map((i) => [i.slot, i]));
  const done = drop.items.length;
  const dark = world.boardBackground === "#1A1A1C";
  const pct = (done / world.slotsPerDrop) * 100;

  return (
    <div>
      <div className="card overflow-hidden p-0">
        <ShopBanner
          world={world}
          onUpload={frozen ? undefined : onUploadBanner}
        />

        <div
          className="transition-colors"
          style={{ background: world.boardBackground }}
        >
          <div
            className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-5 ${
              dark ? "text-white" : "text-ink"
            }`}
          >
            <span className="text-xl font-extrabold tracking-tight">
              Drop {String(drop.number).padStart(2, "0")}
            </span>
            <span
              className={`t-small ${dark ? "text-white/60" : "text-black/50"}`}
            >
              {formatDropDate(drop.publishDate)}
            </span>
            <span className="ml-auto text-sm font-semibold tabular-nums">
              {done} / {world.slotsPerDrop}
            </span>
          </div>

          <div className="px-5 pt-3">
            <div
              className={`h-1 w-full overflow-hidden rounded-full ${dark ? "bg-white/12" : "bg-black/8"}`}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
            {slots.map((s) => (
              <Tile
                key={s}
                slot={s}
                item={bySlot.get(s)}
                frozen={frozen}
                dark={dark}
                onUpload={onUploadMockup}
                onRemove={onRemoveMockup}
                onRename={onRenameMockup ?? (async () => {})}
                onDropOn={onMoveMockup ?? (async () => {})}
                dragging={dragging}
                setDragging={setDragging}
                total={world.slotsPerDrop}
              />
            ))}
          </div>
        </div>
      </div>

      {onBackground && !frozen && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="t-small text-ink-3">Board</span>
          {BACKGROUNDS.map((b) => (
            <button
              key={b.hex}
              onClick={() => onBackground(b.hex)}
              title={b.name}
              className={`h-6 w-6 rounded-full border transition ${
                world.boardBackground === b.hex
                  ? "border-black ring-2 ring-accent ring-offset-1"
                  : "border-black/25 hover:border-ink-3"
              }`}
              style={{ background: b.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
