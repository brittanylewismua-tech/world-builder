"use client";

import { useRef, useState } from "react";
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
        </div>
      )}

      {onUpload && (
        <>
          <button
            onClick={() => input.current?.click()}
            disabled={busy}
            className="absolute bottom-2.5 right-2.5 rounded-xl bg-black/75 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 backdrop-blur transition hover:bg-black group-hover:opacity-100"
          >
            {busy
              ? "Uploading…"
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
  dark,
  onUpload,
  onRemove,
}: {
  slot: number;
  item?: DropItem;
  frozen: boolean;
  dark: boolean;
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

  const bar = dark ? "bg-white/14" : "bg-black/8";
  const barFaint = dark ? "bg-white/7" : "bg-black/5";

  if (item) {
    return (
      <div className="group">
        <div className="relative aspect-square overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.src} alt="" className="h-full w-full object-cover" />
          {!frozen && (
            <button
              onClick={() => onRemove(item)}
              className="absolute inset-x-0 bottom-0 bg-black/80 py-1.5 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100"
            >
              Remove
            </button>
          )}
        </div>
        <div className={`mt-2 h-2 w-4/5 rounded-sm ${bar}`} />
        <div className={`mt-1 h-2 w-1/3 rounded-sm ${bar}`} />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => !frozen && input.current?.click()}
        disabled={frozen || busy}
        className={`flex aspect-square w-full items-center justify-center rounded-xl border border-dashed transition disabled:cursor-default disabled:opacity-40 ${
          dark
            ? "border-white/25 text-white/35 hover:border-white/55 hover:bg-white/5"
            : "border-black/18 text-black/25 hover:border-black/40 hover:bg-black/[0.03]"
        }`}
      >
        <span className="text-xl font-extrabold tracking-tight">
          {busy ? "…" : String(slot).padStart(2, "0")}
        </span>
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
