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
import { Page, PageHeader, Empty } from "@/components/ui";

export default function History() {
  return <Shell>{(world) => <HistoryBody world={world} />}</Shell>;
}

/** Age, stated plainly. Never a claim about how the drop performed. */
function ageNote(d: Drop) {
  const age = daysSince(d.publishDate);
  if (age < 0) return "Not published yet";
  if (age === 0) return "Published today — far too young to read";
  if (age < GATHERING_DAYS)
    return `${age} day${age === 1 ? "" : "s"} old — too young to read`;
  if (age < REVIEW_DAYS)
    return `${age} days old — ${REVIEW_DAYS - age} more until it is worth reviewing`;
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
        <Globe size={64} spin className="opacity-70" />
      </div>
    );

  const frozen = drops.filter((d) => d.frozenAt);

  if (open) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-8 md:px-8">
        <button
          onClick={() => setOpen(null)}
          className="t-small mb-5 text-plum-3 transition hover:text-plum"
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
        <p className="t-small mt-3 text-plum-3">
          {STATUS_LABEL[open.status]} · {ageNote(open)}
        </p>
      </main>
    );
  }

  return (
    <Page width="wide">
      <PageHeader
        eyebrow="Drop History"
        title="Your creative history"
        lede="Every published drop, frozen exactly as you released it. Statuses are lifecycle only — nothing here decides which drops worked."
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
              className="card block w-full p-4 text-left transition hover:border-pink"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="display text-lg text-plum">
                  DROP {String(d.number).padStart(2, "0")}
                </span>
                <span className="t-small text-plum-3">
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
                      className="h-14 w-14 shrink-0 rounded-md border border-dashed border-line"
                    />
                  );
                })}
              </div>

              <p className="t-small mt-3 text-plum-3">
                {d.items.length} of {world.slotsPerDrop} · {ageNote(d)}
              </p>
            </button>
          ))}
        </div>
      )}
    </Page>
  );
}
