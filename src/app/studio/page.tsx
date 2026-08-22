/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DropBoard from "@/components/DropBoard";
import CreativeRoom from "@/components/CreativeRoom";
import { useWorld } from "@/lib/useWorld";
import { saveWorld, setShopBanner } from "@/lib/api";
import {
  freezeNow,
  removeMockup,
  syncSchedule,
  uploadMockup,
  type Drop,
  type DropItem,
} from "@/lib/drops";
import type { World } from "@/lib/world";
import { ErrorNote } from "@/components/ui";

export default function Studio() {
  return <Shell>{(world) => <StudioBody world={world} />}</Shell>;
}

function StudioBody({ world }: { world: World }) {
  const { patch } = useWorld();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const drops = await syncSchedule(world);
      // Newest first; the open board is the one that has not been frozen.
      setDrop(drops.find((d) => !d.frozenAt) ?? drops[0] ?? null);
      setErr("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load your drops.");
    } finally {
      setLoading(false);
    }
  }, [world]);

  useEffect(() => {
    load();
  }, [load]);

  async function onUploadMockup(slot: number, file: File) {
    if (!drop) return;
    try {
      const item = await uploadMockup(drop.id, slot, file);
      setDrop({
        ...drop,
        items: [...drop.items.filter((i) => i.slot !== slot), item],
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That upload failed.");
    }
  }

  async function onRemoveMockup(item: DropItem) {
    if (!drop) return;
    try {
      await removeMockup(item);
      setDrop({ ...drop, items: drop.items.filter((i) => i.id !== item.id) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove that.");
    }
  }

  async function onUploadBanner(file: File) {
    try {
      const { path, src } = await setShopBanner(world.id, file);
      patch({ shopBannerPath: path, shopBannerSrc: src });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Banner upload failed.");
    }
  }

  async function onBackground(hex: string) {
    patch({ boardBackground: hex });
    try {
      await saveWorld(world.id, { boardBackground: hex });
    } catch {
      /* colour is cosmetic; not worth an error banner */
    }
  }

  async function togglePause() {
    const paused = !world.paused;
    patch({ paused });
    await saveWorld(world.id, { paused });
  }

  async function publishNow() {
    if (!drop) return;
    await freezeNow(world, drop);
    setLoading(true);
    await load();
  }

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <img src="/globe.png" alt="" className="globe-turn h-12 w-12 opacity-70" />
      </div>
    );

  if (!drop)
    return (
      <p className="t-body mx-auto max-w-xl px-6 py-20 text-ink-2">
        {err || "No drop board yet."}
      </p>
    );

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
      {err && (
        <ErrorNote>{err}</ErrorNote>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="eyebrow text-ink-3">Drop Studio</span>
        {world.paused && (
          <span className="chip chip-accent">Schedule paused</span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={togglePause}
            className="btn btn-ghost"
          >
            {world.paused ? "Resume schedule" : "Pause schedule"}
          </button>
          <button
            onClick={publishNow}
            className="btn btn-primary"
          >
            Publish &amp; freeze
          </button>
        </div>
      </div>

      {/* SPEC: ~70% board / ~30% Creative Room */}
      <div className="grid gap-6 lg:grid-cols-[7fr_3fr]">
        <DropBoard
          world={world}
          drop={drop}
          onUploadMockup={onUploadMockup}
          onRemoveMockup={onRemoveMockup}
          onUploadBanner={onUploadBanner}
          onBackground={onBackground}
        />
        <div className="lg:sticky lg:top-[72px] lg:h-[calc(100dvh-96px)]">
          <CreativeRoom world={world} drop={drop} />
        </div>
      </div>
    </main>
  );
}
