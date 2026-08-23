"use client";

import { useState } from "react";
import { saveWorld } from "@/lib/api";
import { formatDropDate, nextWeekday, toISODate } from "@/lib/drops";
import type { World } from "@/lib/world";

/**
 * HOW OFTEN, HOW MANY, WHICH DAY.
 *
 * Both of these were stored in the database from the beginning and neither
 * had a control anywhere in the software, so every seller was silently on
 * ten designs every Friday whether that suited their week or not. Ten on a
 * Friday is a sensible default; it is not a rule, and a tool that teaches a
 * rhythm should let the person set the tempo.
 *
 * Changing the day moves the board that is currently being built, so the
 * screen says which date it will land on before anything is saved. Changing
 * the count never removes a design: the floor is whatever is already
 * uploaded, because silently dropping someone's work to fit a smaller grid
 * would be unforgivable.
 */
const DAYS = [
  { n: 1, short: "Mon" },
  { n: 2, short: "Tue" },
  { n: 3, short: "Wed" },
  { n: 4, short: "Thu" },
  { n: 5, short: "Fri" },
  { n: 6, short: "Sat" },
  { n: 7, short: "Sun" },
];

const COUNTS = [4, 6, 8, 10, 12];

export default function DropRhythm({
  world,
  patch,
  onError,
  filledSlots = 0,
}: {
  world: World;
  patch: (p: Partial<World>) => void;
  onError: (s: string) => void;
  /** Designs already uploaded to the board being built. */
  filledSlots?: number;
}) {
  const [busy, setBusy] = useState(false);

  async function save(next: Partial<World>) {
    setBusy(true);
    try {
      await saveWorld(world.id, next);
      patch(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  const landsOn = (n: number) =>
    formatDropDate(toISODate(nextWeekday(new Date(), n)));

  return (
    <div className="space-y-7">
      <div>
        <p className="t-h3 text-ink">Designs in a drop</p>
        <p className="t-small mt-1 text-ink-2">
          How many slots the board holds. Lowering this never deletes
          anything — you cannot go below what is already uploaded.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNTS.map((n) => {
            const blocked = n < filledSlots;
            return (
              <button
                key={n}
                disabled={busy || blocked}
                onClick={() => save({ slotsPerDrop: n })}
                title={
                  blocked
                    ? `You have ${filledSlots} designs on the board already`
                    : undefined
                }
                className={`h-11 w-14 rounded-lg border-2 text-sm font-bold tabular-nums transition ${
                  world.slotsPerDrop === n
                    ? "border-black bg-black text-white"
                    : "border-black/12 bg-white text-ink-2 hover:border-black"
                } disabled:cursor-not-allowed disabled:opacity-35`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="t-h3 text-ink">Drop day</p>
        <p className="t-small mt-1 text-ink-2">
          The day a finished drop publishes and the next board opens. Research
          always runs a week ahead of whichever day you pick.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button
              key={d.n}
              disabled={busy}
              onClick={() => save({ dropWeekday: d.n })}
              className={`h-11 min-w-[3.6rem] rounded-lg border-2 px-2 text-sm font-bold transition ${
                world.dropWeekday === d.n
                  ? "border-black bg-black text-white"
                  : "border-black/12 bg-white text-ink-2 hover:border-black"
              } disabled:opacity-50`}
            >
              {d.short}
            </button>
          ))}
        </div>
        <p className="t-small mt-2.5 text-ink-3">
          Next {DAYS.find((d) => d.n === world.dropWeekday)?.short} is{" "}
          {landsOn(world.dropWeekday)}.
        </p>
      </div>

      <div className="border-t border-black/12 pt-5">
        <p className="t-h3 text-ink">
          {world.paused ? "The schedule is paused" : "The schedule is running"}
        </p>
        <p className="t-small mt-1 max-w-xl text-ink-2">
          {world.paused
            ? "Nothing publishes and nothing freezes while you are paused. The board you are building keeps pace with the calendar, so when you come back you pick up on the next drop day owing nothing."
            : "Drops publish and freeze on their own each week. Pause if you need to step away — your current board waits for you rather than falling behind."}
        </p>
        <button
          disabled={busy}
          onClick={() => save({ paused: !world.paused })}
          className={`mt-3 ${world.paused ? "btn btn-accent" : "btn btn-ghost"}`}
        >
          {world.paused ? "Start the schedule again" : "Pause the schedule"}
        </button>
      </div>
    </div>
  );
}
