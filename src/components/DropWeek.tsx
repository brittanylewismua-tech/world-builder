"use client";

import type { Drop } from "@/lib/drops";

/**
 * THE WEEK, AS SEVEN MARKS.
 *
 * A publish date on its own answers "when" but not "how long have I got",
 * and the second question is the one that actually changes what a seller does
 * this afternoon. Seven dashes ending on publish day answer it without any
 * arithmetic: the filled ones are gone, the hollow ones are what is left, and
 * the count only has to be read if you want a number.
 *
 * Deliberately not a progress bar. A progress bar implies you are meant to be
 * a certain distance along, which is a judgement this thing has no business
 * making — some drops come together on the last day. It reports where the
 * week is, and stops.
 *
 * Dates are handled in local time throughout. `new Date("2026-09-04")` is
 * parsed as UTC and can render as the 3rd for anyone west of Greenwich, which
 * would put the whole strip a day out for most of the audience.
 */

const DAY = 86_400_000;

function localMidnight(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function today() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export default function DropWeek({ drop }: { drop: Drop }) {
  const publish = localMidnight(drop.publishDate);
  const now = today();

  // Seven days ending on publish day, so the last mark is the deadline.
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(publish.getTime() - (6 - i) * DAY);
    return {
      date,
      past: date < now,
      today: date.getTime() === now.getTime(),
      last: i === 6,
    };
  });

  const left = Math.round((publish.getTime() - now.getTime()) / DAY);
  const started = days[0].date <= now;

  const when =
    left > 1
      ? `${left} days left`
      : left === 1
        ? "1 day left"
        : left === 0
          ? "publishes today"
          : "past its date";

  return (
    <div className="mb-3">
      <div className="flex items-end gap-1.5">
        {days.map((d, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={`text-[10px] font-semibold uppercase leading-none tracking-wide ${
                d.today ? "text-ink" : "text-ink-3"
              }`}
            >
              {d.date.toLocaleDateString("en-US", { day: "numeric" })}
            </span>
            <span
              title={d.date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
              className={`h-1.5 w-full rounded-full transition ${
                d.today
                  ? "bg-accent"
                  : d.past
                    ? "bg-black/70"
                    : d.last
                      ? "bg-black/25"
                      : "bg-black/12"
              }`}
            />
          </div>
        ))}
      </div>

      <p className="t-small mt-1.5 text-ink-3">
        {started ? when : "starts soon"} · publishes{" "}
        {publish.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      </p>
    </div>
  );
}
