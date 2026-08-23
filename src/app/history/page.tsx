"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DropBoard from "@/components/DropBoard";
import {
  loadDrops,
  formatDropDate,
  STATUS_LABEL,
  daysSince,
  type Drop,
} from "@/lib/drops";
import type { World } from "@/lib/world";
import { Page, PageHeader, Empty } from "@/components/ui";

export default function History() {
  return <Shell>{(world) => <HistoryBody world={world} />}</Shell>;
}

/*
  This used to say things like "too young to read" and "enough history to look
  at", which promised a reading that does not exist — no Etsy data is
  connected to this software, so there is nothing to read at any age. Age is
  now just age. When real performance data is attached, this is where it
  belongs.
*/
function ageNote(d: Drop) {
  const age = daysSince(d.publishDate);
  if (age < 0) return `Publishes ${formatDropDate(d.publishDate)}`;
  if (age === 0) return "Published today";
  return `Published ${age} day${age === 1 ? "" : "s"} ago`;
}

function HistoryBody({ world }: { world: World }) {
  const [drops, setDrops] = useState<Drop[] | null>(null);
  const [open, setOpen] = useState<Drop | null>(null);

  useEffect(() => {
    loadDrops(world.id).then(setDrops).catch(() => setDrops([]));
  }, [world.id]);

  if (!drops)
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <img src="/globe.png" alt="" className="globe-turn h-12 w-12 opacity-70" />
      </div>
    );

  const frozen = drops.filter((d) => d.frozenAt);

  if (open) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8 md:px-8">
        <button
          onClick={() => setOpen(null)}
          className="t-small mb-5 text-ink-3 transition hover:text-ink"
        >
          ← All drops
        </button>
        <DropBoard
          world={world}
          drop={open}
          frozen
          onUploadMockup={async () => {}}
          onRemoveMockup={async () => {}}
        />
        <p className="t-small mt-3 text-ink-3">
          {STATUS_LABEL[open.status]} · {ageNote(open)} · No Etsy performance
          data attached.
        </p>
      </main>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Drop History"
        title="Your creative history"
        lede="Every published drop, frozen exactly as you released it. No Etsy performance data is attached to any of these — statuses describe where a drop is in its life, never how it did."
      />

      {frozen.length === 0 ? (
        <Empty
          title="Nothing frozen yet"
          body="Your first drop lands in the archive the day it publishes."
        />
      ) : (
        <div className="space-y-3">
          {frozen.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpen(d)}
              className="card card-hover block w-full p-4 text-left"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-lg font-extrabold tracking-tight">
                  DROP {String(d.number).padStart(2, "0")}
                </span>
                <span className="t-small text-ink-3">
                  {formatDropDate(d.publishDate)}
                </span>
                <span className="chip chip-accent ml-auto">
                  {STATUS_LABEL[d.status]}
                </span>
              </div>

              <div className="mt-3 flex gap-1.5 overflow-hidden">
                {Array.from({ length: world.slotsPerDrop }, (_, i) => {
                  const item = d.items.find((x) => x.slot === i + 1);
                  return item ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={item.src}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div
                      key={i}
                      className="h-14 w-14 shrink-0 rounded-md border border-dashed border-black/12"
                    />
                  );
                })}
              </div>

              <p className="t-small mt-3 text-ink-3">
                {d.items.length} of {world.slotsPerDrop} · {ageNote(d)}
              </p>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
