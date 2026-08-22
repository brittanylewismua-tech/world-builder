"use client";

import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import DropBoard from "@/components/DropBoard";
import {
  loadDrops,
  formatDropDate,
  STATUS_LABEL,
  daysSince,
  GATHERING_DAYS,
  REVIEW_DAYS,
  type Drop,
} from "@/lib/drops";
import type { World } from "@/lib/world";
import { Globe } from "@/components/Globe";

export default function History() {
  return <Shell>{(world) => <HistoryBody world={world} />}</Shell>;
}

/** Age, stated plainly. Never a claim about how the drop performed. */
function ageNote(d: Drop) {
  const age = daysSince(d.publishDate);
  if (age < 0) return "Not published yet";
  if (age < GATHERING_DAYS)
    return `${age} day${age === 1 ? "" : "s"} old — too young to read`;
  if (age < REVIEW_DAYS)
    return `${age} days old — ${REVIEW_DAYS - age} until it is worth reviewing`;
  return `${age} days old — enough history to look at`;
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
        <Globe size={140} spin />
      </div>
    );

  const frozen = drops.filter((d) => d.frozenAt);

  if (open) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-6">
        <button
          onClick={() => setOpen(null)}
          className="eyebrow mb-5 text-smoke transition hover:text-pink"
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
        <p className="mt-4 text-sm text-smoke">
          {STATUS_LABEL[open.status]} · {ageNote(open)}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <span className="eyebrow text-pink/70">Drop History</span>
      <h1 className="display mt-3 text-[clamp(2rem,5vw,3rem)] text-paper">
        Your creative history
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-smoke">
        Every published drop, frozen exactly as you released it. Statuses are
        lifecycle only — nothing here decides which drops worked.
      </p>

      {frozen.length === 0 ? (
        <p className="mt-12 border-l-2 border-pink/40 pl-5 text-sm leading-relaxed text-smoke">
          Nothing frozen yet. Your first drop lands in the archive the day it
          publishes.
        </p>
      ) : (
        <div className="mt-10 space-y-4">
          {frozen.map((d) => (
            <button
              key={d.id}
              onClick={() => setOpen(d)}
              className="block w-full border border-paper/12 p-4 text-left transition hover:border-pink/60 hover:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="display text-xl text-paper">
                  DROP {String(d.number).padStart(2, "0")}
                </span>
                <span className="eyebrow text-smoke">
                  {formatDropDate(d.publishDate)}
                </span>
                <span className="eyebrow ml-auto text-pink">
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
                      className="h-16 w-16 shrink-0 object-cover"
                    />
                  ) : (
                    <div
                      key={i}
                      className="h-16 w-16 shrink-0 border border-paper/10"
                    />
                  );
                })}
              </div>

              <p className="mt-3 text-xs text-smoke">
                {d.items.length} of {world.slotsPerDrop} · {ageNote(d)}
              </p>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}
