import { serviceDb } from "./billing";

/**
 * WORLD BUILDER IS PART OF THE GOLDIE SUITE (10 Oct 2026, Brittany).
 *
 * Access is still the one column it always was — wb_admitted.expires_at — but
 * the only thing that moves it now is The Goldie Suite. Every time a member
 * opens the app (and whenever a paid action finds the account stale) this asks
 * the suite, with the member's own sign-in token, "is this person a Goldie
 * Suite member, and until when?" and writes the answer:
 *
 *   member      → live until the suite's end date, and never more than 48 hours
 *                 ahead, so a cancelled or lapsed suite membership closes World
 *                 Builder within two days even if the person never comes back.
 *   not member  → stale from this moment.
 *
 * Nothing in anybody's world is touched either way. Joining the suite with the
 * same email opens everything exactly as it was left.
 *
 * Only people on the suite's World Building list, on a PAID membership (not the
 * free trial), get in (decided by the suite). There is no World Builder
 * subscription; the old "subscriber" code was an admin grant and gets no
 * exemption. Only Brittany's own "founder" accounts are left alone. If the
 * suite cannot be reached, nothing changes.
 */
export const SUITE_URL = "https://thegoldiesuite.com";
const WINDOW_MS = 48 * 3600_000;

export type SuiteAnswer = { live: boolean | null; reason?: string };

export async function syncFromSuite(userId: string, token: string): Promise<SuiteAnswer> {
  let answer: { active?: boolean; until?: number | null; reason?: string } | null = null;
  try {
    const r = await fetch(`${SUITE_URL}/api/partner/world-builder`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!r.ok) return { live: null };
    answer = await r.json();
  } catch {
    return { live: null };
  }
  const db = serviceDb();
  const { data: held } = await db
    .from("wb_admitted")
    .select("code, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (held?.code === "founder") return { live: null };
  const now = Date.now();
  if (answer?.active) {
    const until = answer.until ? Math.min(answer.until * 1000, now + WINDOW_MS) : now + WINDOW_MS;
    await db.from("wb_admitted").upsert(
      { user_id: userId, code: "goldie-suite", expires_at: new Date(until).toISOString() },
      { onConflict: "user_id" },
    );
    return { live: true };
  }
  if (held && (held.expires_at === null || new Date(held.expires_at).getTime() > now)) {
    await db.from("wb_admitted").update({ expires_at: new Date(now).toISOString() }).eq("user_id", userId);
  }
  return { live: false, reason: answer?.reason };
}

/**
 * Anything that is not a Goldie Suite member (or one of Brittany's founder
 * accounts) goes stale. Run by the hourly job, so challenge accounts, codes
 * and comped dates cannot keep the doors open (or the weekly issue writing).
 */
export async function closeNonMembers() {
  const db = serviceDb();
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("wb_admitted")
    .update({ expires_at: nowIso })
    .not("code", "in", '("founder","goldie-suite")')
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .select("user_id");
  return { closed: data?.length ?? 0, error: error?.message };
}
