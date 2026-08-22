"use client";

import { useRef, useState } from "react";
import type { World } from "@/lib/world";
import {
  formatDropDate,
  STATUS_LABEL,
  type Drop,
  type DropItem,
} from "@/lib/drops";

/**
 * SPEC: "It loosely simulates the visual experience of looking at products
 *        together inside an Etsy shop. It is not pretending to predict Etsy
 *        performance. It is a creative visualization workspace."
 */

const BACKGROUNDS = [
  { hex: "#F2EFEA", name: "Paper" },
  { hex: "#FFFFFF", name: "White" },
  { hex: "#FBF6EC", name: "Ivory" },
  { hex: "#F8E4EC", name: "Pale pink" },
  { hex: "#E8EDE9", name: "Sage" },
  { hex: "#1A1A1C", name: "Charcoal" },
];

/** Deterministic banner colour from the world name, so it feels intentional. */
function bannerColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 26%)`;
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
          className="h-28 w-full object-cover sm:h-36"
        />
      ) : (
        <div
          className="flex h-28 w-full items-center justify-center sm:h-36"
          style={{ background: bannerColor(world.name || "world") }}
        >
          <span className="display px-6 text-center text-[clamp(1.4rem,4vw,2.6rem)] text-white/95">
            {world.name || "Your Shop"}
          </span>
        </div>
      )}

      {onUpload && (
        <>
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="absolute bottom-2 right-2 bg-black/70 px-3 py-1.5 text-[10px] uppercase tracking-widest text-white/80 opacity-0 transition hover:text-pink group-hover:opacity-100"
          >
            {busy
              ? "Uploading"
              : world.shopBannerSrc
                ? "Replace banner"
                : "Upload banner"}
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
  onUpload,
  onRemove,
}: {
  slot: number;
  item?: DropItem;
  frozen: boolean;
  onUpload: (slot: number, file: File) => Promise<void>;
  onRemove: (item: DropItem) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    await onUpload(slot, f);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  if (item) {
    return (
      <div className="group relative">
        <div className="aspect-square overflow-hidden bg-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.src} alt="" className="h-full w-full object-cover" />
        </div>
        {!frozen && (
          <button
            onClick={() => onRemove(item)}
            className="absolute right-1.5 top-1.5 bg-black/75 px-2 py-1 text-[10px] uppercase tracking-widest text-white/80 opacity-0 transition hover:text-pink group-hover:opacity-100"
          >
            remove
          </button>
        )}
        <div className="mt-1.5 h-3 w-4/5 bg-black/10" />
        <div className="mt-1 h-3 w-1/3 bg-black/10" />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => !frozen && input.current?.click()}
        disabled={frozen || busy}
        className="flex aspect-square w-full items-center justify-center border border-dashed border-black/20 transition hover:border-black/45 hover:bg-black/[0.03] disabled:cursor-default disabled:opacity-40"
      >
        <span className="display text-3xl text-black/25">
          {busy ? "…" : String(slot).padStart(2, "0")}
        </span>
      </button>
      <div className="mt-1.5 h-3 w-4/5 bg-black/[0.06]" />
      <div className="mt-1 h-3 w-1/3 bg-black/[0.06]" />
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
  onUploadBanner,
  onBackground,
}: {
  world: World;
  drop: Drop;
  frozen?: boolean;
  onUploadMockup: (slot: number, file: File) => Promise<void>;
  onRemoveMockup: (item: DropItem) => Promise<void>;
  onUploadBanner?: (file: File) => Promise<void>;
  onBackground?: (hex: string) => void;
}) {
  const slots = Array.from({ length: world.slotsPerDrop }, (_, i) => i + 1);
  const bySlot = new Map(drop.items.map((i) => [i.slot, i]));
  const done = drop.items.length;
  const dark = world.boardBackground === "#1A1A1C";

  return (
    <div>
      {/* board */}
      <div
        className="border border-pink/20 transition-colors"
        style={{ background: world.boardBackground }}
      >
        <ShopBanner world={world} onUpload={frozen ? undefined : onUploadBanner} />

        <div
          className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 pt-5 ${
            dark ? "text-white" : "text-black"
          }`}
        >
          <span className="display text-2xl">
            DROP {String(drop.number).padStart(2, "0")}
          </span>
          <span className="eyebrow opacity-60">
            {formatDropDate(drop.publishDate)}
          </span>
          <span className="ml-auto display text-xl">
            {done} / {world.slotsPerDrop}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          {slots.map((s) => (
            <Tile
              key={s}
              slot={s}
              item={bySlot.get(s)}
              frozen={frozen}
              onUpload={onUploadMockup}
              onRemove={onRemoveMockup}
            />
          ))}
        </div>
      </div>

      {/* board controls */}
      {onBackground && !frozen && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="eyebrow text-smoke">Board</span>
          {BACKGROUNDS.map((b) => (
            <button
              key={b.hex}
              onClick={() => onBackground(b.hex)}
              title={b.name}
              className={`h-7 w-7 border-2 transition ${
                world.boardBackground === b.hex
                  ? "border-pink"
                  : "border-paper/20 hover:border-paper/50"
              }`}
              style={{ background: b.hex }}
            />
          ))}
          {frozen && (
            <span className="eyebrow ml-auto text-pink">
              {STATUS_LABEL[drop.status]}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
