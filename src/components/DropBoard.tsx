"use client";

import { useRef, useState } from "react";
import type { World } from "@/lib/world";
import SlotCount from "./SlotCount";
import Zoomable from "./Zoomable";
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
  drop,
  onUpload,
  onClear,
}: {
  world: World;
  drop: Drop;
  onUpload?: (file: File) => Promise<void>;
  /** Take the banner back off and return to the drop number. */
  onClear?: () => Promise<void>;
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
    /*
      ETSY'S OWN PROPORTIONS.
      
      A seller already has a shop banner sized for Etsy, and asking her to crop
      a second one for us is a chore with no payoff. Etsy's big banner is
      1600×400 — 4:1 — so the slot is 4:1 and her existing file drops straight
      in without a letterbox or a crop.
    */
    <div className="group relative aspect-[4/1] w-full overflow-hidden">
      {world.shopBannerSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={world.shopBannerSrc}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        /*
          The empty banner is brand pink rather than a colour derived from the
          world's name. A different pink for every world made the product look
          like it could not decide what colour it was, and this is the first
          thing on the page.
        */
        <div
          className="flex h-full w-full items-center justify-center"
          style={{ background: "var(--accent)" }}
        >
          <span
            className="px-6 text-center text-[clamp(1.5rem,4vw,2.6rem)] font-extrabold tracking-tight"
            style={{ color: "var(--accent-on)" }}
          >
            Drop {String(drop.number).padStart(2, "0")}
          </span>
        </div>
      )}

      {/*
        Only when there is something to remove, and only next to the control
        that put it there — an X floating on an empty pink banner would be an
        offer to delete nothing.
      */}
      {onClear && world.shopBannerSrc && (
        <button
          onClick={async () => {
            if (!window.confirm("Remove this banner?")) return;
            setBusy(true);
            await onClear();
            setBusy(false);
          }}
          disabled={busy}
          aria-label="Remove this banner"
          title="Remove this banner"
          className="absolute right-[7.5rem] top-2.5 flex h-7 w-7 items-center justify-center rounded-lg border-2 border-black bg-white text-[13px] font-bold leading-none text-black shadow-[2px_2px_0_#000] transition hover:bg-accent-soft"
        >
          ×
        </button>
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
  onDropOn,
  dragging,
  setDragging,
  total,
  freeSlots,
  onTooMany,
}: {
  slot: number;
  item?: DropItem;
  frozen: boolean;
  dark: boolean;
  onUpload: (slot: number, file: File) => Promise<void>;
  onRemove: (item: DropItem) => Promise<void>;
  onDropOn: (from: number, to: number) => Promise<void>;
  dragging: number | null;
  setDragging: (n: number | null) => void;
  /** Highest slot number, so the last tile cannot move further right. */
  total: number;
  /* Empty slots in order, this one first. Lets a multi-file pick fill the
     board rather than only the tile that was clicked. */
  freeSlots?: number[];
  onTooMany?: (spare: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  // The board can reorder underneath this tile, so follow the item.

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

  /*
    ONE FILE OR TWENTY, THROUGH THE SAME PICKER.

    Every empty slot had its own single-file input, so filling a ten-slot drop
    meant ten trips through the file dialog for artwork that is almost always
    exported as a folder at once. Choosing several files now fills this slot
    and then the next free ones in order; anything that does not fit is
    reported rather than dropped silently.

    A filled tile still takes exactly one file — there it means "replace this
    one", and quietly spilling the rest into other slots would be the wrong
    reading of the same gesture.
  */
  async function pick(files: FileList | null) {
    const chosen = files ? Array.from(files) : [];
    if (!chosen.length) return;
    setBusy(true);
    try {
      if (item) await onUpload(slot, chosen[0]);
      else {
        const open = freeSlots ?? [slot];
        const room = open.slice(0, chosen.length);
        for (let index = 0; index < room.length; index += 1)
          await onUpload(room[index], chosen[index]);
        const spare = chosen.length - room.length;
        if (spare > 0) onTooMany?.(spare);
      }
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
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
          <Zoomable
            src={item.src ?? ""}
            caption={item.title}
            className="h-full w-full object-cover"
          />
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
            <div className="absolute inset-x-0 bottom-0 flex items-stretch justify-center gap-px opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
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
                className="flex-1 bg-black/80 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-black"
                aria-label={`Replace the design in slot ${slot}`}
              >
                Replace
              </button>
              <button
                onClick={() => onRemove(item)}
                className="flex-1 bg-black/80 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-black"
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
            {!frozen && (
              <>
                <span className="text-[17px] leading-none">↑</span>
                <span className="text-[12px] font-semibold">Add designs</span>
                <span className="text-[10.5px] opacity-60">PNG or JPG · pick several</span>
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
        multiple
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
  onClearBanner,
  onBackground,
  onSlots,
}: {
  world: World;
  drop: Drop;
  frozen?: boolean;
  onUploadMockup: (slot: number, file: File) => Promise<void>;
  onRemoveMockup: (item: DropItem) => Promise<void>;
  onRenameMockup?: (item: DropItem, title: string) => Promise<void>;
  onMoveMockup?: (from: number, to: number) => Promise<void>;
  onUploadBanner?: (file: File) => Promise<void>;
  onClearBanner?: () => Promise<void>;
  onBackground?: (hex: string) => void;
  /** Change how many designs a drop holds. Absent on frozen boards. */
  onSlots?: (n: number) => Promise<void>;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  /* How many chosen files had nowhere to go. Said once, above the board. */
  const [spare, setSpare] = useState(0);
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
          drop={drop}
          onUpload={frozen ? undefined : onUploadBanner}
          onClear={frozen ? undefined : onClearBanner}
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
            {/*
              The drop number moved up into the banner, so repeating it here
              was the same words twice, eight pixels apart.
            */}
            <span
              className={`t-small ${dark ? "text-white/60" : "text-black/50"}`}
            >
              {formatDropDate(drop.publishDate)}
            </span>
            <span className="ml-auto">
              {onSlots && !frozen ? (
                <SlotCount
                  done={done}
                  slots={world.slotsPerDrop}
                  onChange={onSlots}
                />
              ) : (
                <span className="text-sm font-semibold tabular-nums">
                  {done} / {world.slotsPerDrop}
                </span>
              )}
            </span>
          </div>

          {spare > 0 && (
            <div className="px-5 pt-3">
              <p
                className={`t-small ${dark ? "text-white/75" : "text-black/60"}`}
                role="status"
              >
                {spare} more {spare === 1 ? "design was" : "designs were"} chosen than
                this drop has room for, so {spare === 1 ? "it was" : "they were"} not
                added. Add slots, or choose fewer.{" "}
                <button
                  type="button"
                  onClick={() => setSpare(0)}
                  className="underline underline-offset-2"
                >
                  Dismiss
                </button>
              </p>
            </div>
          )}

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
                freeSlots={[s, ...slots.filter((n) => n !== s && !bySlot.has(n))]}
                onTooMany={setSpare}
                item={bySlot.get(s)}
                frozen={frozen}
                dark={dark}
                onUpload={onUploadMockup}
                onRemove={onRemoveMockup}
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
