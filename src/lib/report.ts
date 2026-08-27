"use client";

import { supabase } from "./supabase";

/**
 * WHEN SOMETHING BREAKS, SOMEBODY SHOULD KNOW.
 *
 * Until now a failure was invisible unless the seller happened to write in
 * and describe it. With a paid cohort arriving that is the difference between
 * fixing a problem the morning it starts and hearing about it in a refund
 * request three weeks later.
 *
 * This is deliberately the smallest thing that works. No third-party service,
 * no session replay, no per-seller tracking — one row saying which surface
 * failed and what it said, readable from the Supabase dashboard. It records
 * failures, not behaviour.
 *
 * It must never make things worse: reporting is fire-and-forget, and a
 * reporting failure is swallowed. An error while logging an error has no
 * business reaching the person trying to use the software.
 */
export type Surface =
  | "daily"
  | "customer"
  | "room"
  | "board"
  /* Uploading an export and reading the wall fail for very different
     reasons — a bad file against a model call — so they are counted apart. */
  | "winners"
  | "winners-read"
  | "studio"
  | "setup"
  | "auth";

export function report(
  surface: Surface,
  error: unknown,
  detail: Record<string, unknown> = {},
) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown failure";

  void (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      await supabase.from("wb_errors").insert({
        user_id: uid,
        world_id: (detail.worldId as string) ?? null,
        surface,
        message: message.slice(0, 500),
        detail: {
          ...detail,
          at: new Date().toISOString(),
          path: typeof location !== "undefined" ? location.pathname : null,
        },
      });
    } catch {
      // Deliberately silent. See above.
    }
  })();
}
