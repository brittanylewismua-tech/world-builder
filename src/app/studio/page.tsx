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
  moveItemToSlot,
  removeMockup,
  renameItem,
  splitDrops,
  syncSchedule,
  uploadMockup,
  type Drop,
  type DropItem,
} from "@/lib/drops";
import ResearchBoard from "@/components/ResearchBoard";
import type { World } from "@/lib/world";
import { report } from "@/lib/report";
import { ErrorNote } from "@/components/ui";

export default function Studio() {
  return <Shell>{(world) => <StudioBody world={world} />}</Shell>;
}

function StudioBody({ world }: { world: World }) {
  const { patch } = useWorld();
  const [drop, setDrop] = useState<Drop | null>(null);
  const [next, setNext] = useState<Drop | null>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  /**
   * Make this week, research next week. Both always one click apart.
   *
   * Home links straight at the research half with ?tab=research, so the
   * "researching next" card lands on the board rather than on the build
   * screen with an extra click still to make.
   */
  const [tab, setTab] = useState<"build" | "research">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("tab") === "research"
      ? "research"
      : "build",
  );
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const all = await syncSchedule(world);
      setDrops(all);
      const { current, next: upcoming } = splitDrops(all);
      setDrop(current);
      setNext(upcoming);
      setErr("");
    } catch (e) {
      report("studio", e, { worldId: world.id });
      setErr(e instanceof Error ? e.message : "Could not load your drops.");
    } finally {
      setLoading(false);
    }
  }, [world]);

  useEffect(() => {
    load();
  }, [load]);

  /** Rearranging the board is a creative act; it should feel instant. */
  async function onMoveMockup(from: number, to: number) {
    if (!drop) return;
    const before = drop;
    const moving = drop.items.find((i) => i.slot === from);
    if (!moving) return;
    const sitting = drop.items.find((i) => i.slot === to);
    setDrop({
      ...drop,
      items: drop.items.map((i) =>
        i.id === moving.id
          ? { ...i, slot: to }
          : sitting && i.id === sitting.id
            ? { ...i, slot: from }
            : i,
      ),
    });
    try {
      await moveItemToSlot(before, from, to);
    } catch (e) {
      setDrop(before);
      setErr(e instanceof Error ? e.message : "That did not move.");
    }
  }

  async function onRenameMockup(item: DropItem, title: string) {
    if (!drop) return;
    try {
      const saved = await renameItem(item, title);
      setDrop({
        ...drop,
        items: drop.items.map((i) =>
          i.id === item.id ? { ...i, title: saved } : i,
        ),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That name did not save.");
    }
  }

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
    if (
      paused &&
      !window.confirm(
        "Pause the weekly schedule?\n\nYour current drop and research board stay exactly as they are. No new publish date is assigned until you resume. Nothing is deleted or archived.",
      )
    )
      return;
    patch({ paused });
    await saveWorld(world.id, { paused });
  }

  /**
   * Publishing is the one irreversible action in the product: the board
   * freezes, the week rolls, and next week's research becomes the drop being
   * built. It is allowed at any fill level — a seller may deliberately
   * release six designs — but never by accident, and never without being told
   * what happens next.
   */
  async function publishNow() {
    if (!drop) return;
    const filled = drop.items.length;

    const consequences = [
      `Drop ${String(drop.number).padStart(2, "0")} moves into your history and its board becomes read-only.`,
      next
        ? `Drop ${String(next.number).padStart(2, "0")} research becomes the drop you are building, and a fresh research board opens behind it.`
        : "A new drop opens for next week.",
      filled < world.slotsPerDrop
        ? `The ${world.slotsPerDrop - filled} empty slot${world.slotsPerDrop - filled === 1 ? "" : "s"} stay empty in the archived version.`
        : null,
      "Your research is kept and stays attached to this drop.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const question =
      filled === 0
        ? `This drop has no designs in it at all.\n\nAre you sure you want to archive Drop ${String(drop.number).padStart(2, "0")} as published?\n\n${consequences}`
        : `Publish Drop ${String(drop.number).padStart(2, "0")} with ${filled} of ${world.slotsPerDrop} slots filled?\n\n${consequences}`;

    if (!window.confirm(question)) return;

    await freezeNow(world, drop);
    setLoading(true);
    setTab("build");
    await load();
  }

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <img src="/globe.png" alt="" className="globe-turn h-12 w-12 opacity-70" />
      </div>
    );

  /*
    A seller should never meet a raw exception here. Their first board is
    created automatically, so reaching this screen means something went
    wrong on the way — almost always transient. Say that plainly and give
    them the button rather than a sentence written for a developer.
  */
  if (!drop)
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <img
          src="/globe.png"
          alt=""
          className="mx-auto h-12 w-12 opacity-60"
        />
        <h1 className="t-h2 mt-5 text-ink">Your board could not be opened</h1>
        <p className="t-body mt-2 text-ink-2">
          Your first drop board is created for you the moment you arrive, so
          this usually means the connection dropped on the way. Nothing has
          been lost — try again.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="btn btn-accent mt-5"
        >
          Try again
        </button>
        {err && (
          <p className="t-small mt-4 text-ink-3">
            If it keeps happening, this is what it said: {err}
          </p>
        )}
      </main>
    );

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6 md:px-8">
      {err && (
        <ErrorNote>{err}</ErrorNote>
      )}

      {/* The weekly rhythm, made obvious: build this one, research the next. */}
      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border-2 border-black p-1">
        <button
          onClick={() => setTab("build")}
          className={`flex-1 rounded-lg px-4 py-2.5 text-left transition ${
            tab === "build" ? "bg-black text-white" : "hover:bg-black/5"
          }`}
        >
          <span className="block text-[13.5px] font-bold">
            Drop {String(drop.number).padStart(2, "0")} · building
          </span>
          <span className="block text-[11.5px] opacity-70">
            {drop.items.length} of {world.slotsPerDrop} designs in
          </span>
        </button>
        {next && (
          <button
            onClick={() => setTab("research")}
            className={`flex-1 rounded-lg px-4 py-2.5 text-left transition ${
              tab === "research" ? "bg-black text-white" : "hover:bg-black/5"
            }`}
          >
            <span className="block text-[13.5px] font-bold">
              Drop {String(next.number).padStart(2, "0")} · research
            </span>
            <span className="block text-[11.5px] opacity-70">
              collecting for next week
            </span>
          </button>
        )}
      </div>

      {/*
        The Creative Room is handed to the board rather than rendered
        separately, so the seller looks at their material and talks about it in
        the same place. It is pointed at the drop being researched, not the one
        being built — a different conversation about a different week.
      */}
      {tab === "research" && next && (
        <ResearchBoard
          world={world}
          drop={next}
          chat={<CreativeRoom world={world} drop={next} drops={drops} />}
        />
      )}

      <div
        className={`mb-4 flex flex-wrap items-center gap-3 ${tab === "research" ? "hidden" : ""}`}
      >
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
          <button onClick={publishNow} className="btn btn-primary">
            Publish &amp; freeze
          </button>
        </div>
      </div>

      {/* SPEC: ~70% board / ~30% Creative Room */}
      <div
        className={`grid gap-6 lg:grid-cols-[7fr_3fr] ${tab === "research" ? "hidden" : ""}`}
      >
        <DropBoard
          world={world}
          drop={drop}
          onUploadMockup={onUploadMockup}
          onRemoveMockup={onRemoveMockup}
          onRenameMockup={onRenameMockup}
          onMoveMockup={onMoveMockup}
          onUploadBanner={onUploadBanner}
          onBackground={onBackground}
        />
        <div className="lg:sticky lg:top-[72px] lg:h-[calc(100dvh-96px)]">
          <CreativeRoom world={world} drop={drop} drops={drops} />
        </div>
      </div>
    </main>
  );
}
