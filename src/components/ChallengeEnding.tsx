"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * THE LAST WEEK, SAID ONCE, IN THE ONE PLACE PEOPLE START.
 *
 * This began as a strip across the top of every screen, which is a countdown
 * following somebody around their own work. Home is where a session starts,
 * it is seen every time, and it is the only screen where "your access ends
 * soon" is information rather than nagging.
 *
 * Nothing at all until the last seven days, and nothing ever for a
 * subscriber — an account with no expiry never sees this.
 */

/** Where somebody goes to keep their access. Set once, used here. */
const UPGRADE_URL = process.env.NEXT_PUBLIC_UPGRADE_URL || "";

export default function ChallengeEnding() {
  const [endsAt, setEndsAt] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase
      .from("wb_admitted")
      .select("expires_at")
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setEndsAt((data?.expires_at as string | null) ?? null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!endsAt) return null;
  const days = Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000);
  if (days > 7 || days < 0) return null;

  return (
    <div
      className="mb-6 rounded-xl border-2 border-black p-5"
      style={{ boxShadow: "4px 4px 0 var(--accent)" }}
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="t-h3 text-ink">
            {days <= 0
              ? "Your challenge access ends today"
              : days === 1
                ? "One day left of your challenge access"
                : `${days} days left of your challenge access`}
          </p>
          {/*
            The reassurance matters more than the deadline. Somebody three
            weeks into building a world needs to know the work survives —
            that is what makes continuing an easy decision rather than a
            fearful one.
          */}
          <p className="t-small mt-1.5 text-ink-2">
            Everything you have built stays exactly where it is. Keep going
            and nothing changes; nothing is lost either way.
          </p>
        </div>
        {UPGRADE_URL && (
          <a
            href={UPGRADE_URL}
            className="btn btn-accent shrink-0"
            target="_blank"
            rel="noopener noreferrer"
          >
            Keep my access
          </a>
        )}
      </div>
    </div>
  );
}
