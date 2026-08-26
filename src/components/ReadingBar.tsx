"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A BAR FOR A JOB THAT CANNOT REPORT ITS PROGRESS.
 *
 * Reading a world takes about a minute, and longer on a quiet week when the
 * first sweep comes up short and a wider one runs after it. A spinner for
 * that long reads as a hang — the seller cannot tell the difference between
 * working and broken, and starts pressing things.
 *
 * There is no honest percentage available: the work happens inside two model
 * calls that report nothing until they return. So this is a time estimate,
 * drawn honestly — it eases toward the finish and never claims to have got
 * there. It cannot stall at 100% and then sit, which is the specific lie that
 * makes people give up on a progress bar, because it is asymptotic: always
 * moving, never arriving, until the real work actually lands and the whole
 * thing unmounts.
 *
 * A slow run does not break it. Past the expected duration the curve is still
 * climbing, just more and more slowly, which is a fair description of what is
 * happening.
 */
export default function ReadingBar({
  /** Roughly how long this usually takes, in seconds. */
  expect = 60,
  className = "",
}: {
  expect?: number;
  className?: string;
}) {
  const [pct, setPct] = useState(0);
  const began = useRef(Date.now());

  useEffect(() => {
    const started = began.current;
    const tick = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      /*
        1 - e^(-t/τ) approaches 1 and never reaches it. τ = expect/2 puts the
        bar around 86% at the expected time, which leaves visible room for the
        run that takes longer without ever having to go backwards.
      */
      const eased = 1 - Math.exp(-seconds / (expect / 2));
      setPct(Math.min(0.96, eased));
    }, 180);
    return () => clearInterval(tick);
  }, [expect]);

  return (
    <div
      role="progressbar"
      aria-label="Reading your world"
      /*
        No aria-valuenow. The number is a guess, and announcing a guessed
        percentage to somebody using a screen reader is worse than telling
        them only that it is working.
      */
      className={`h-1.5 w-full overflow-hidden rounded-full bg-black/10 ${className}`}
    >
      <div
        className="h-full rounded-full transition-[width] duration-200 ease-out"
        style={{ width: `${pct * 100}%`, background: "var(--accent)" }}
      />
    </div>
  );
}
