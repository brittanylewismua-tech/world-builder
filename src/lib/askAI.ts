"use client";

import { supabase } from "./supabase";

/**
 * The one way this app talks to its AI routes.
 *
 * Those routes now require a real session, so every call has to carry the
 * caller's token. Putting that in a single place means no screen can forget
 * it, and the 401 and 429 cases get one consistent, human explanation instead
 * of four slightly different ones.
 */
export async function askAI<T>(
  path: string,
  payload: unknown,
  opts: { timeoutMs?: number } = {},
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token)
    throw new Error("You are signed out. Reload the page and sign back in.");

  /*
    A request with no ceiling is worse than a failed one: the screen sits in
    its loading state forever and the person cannot tell whether to wait or
    reload. Every AI call now gives up out loud.
  */
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), opts.timeoutMs ?? 150_000);

  let r: Response;
  try {
    r = await fetch(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: stop.signal,
    });
  } catch (e) {
    if (stop.signal.aborted)
      throw new Error("That took too long and stopped. Try it again.");
    throw new Error(
      e instanceof Error && e.message
        ? "That did not reach the server. Check your connection and try again."
        : "That did not go through.",
    );
  } finally {
    clearTimeout(timer);
  }

  let body: { error?: string } & Record<string, unknown> = {};
  try {
    body = await r.json();
  } catch {
    /* a non-JSON failure is handled by the status check below */
  }

  if (!r.ok) throw new Error(body.error || "That did not go through.");
  return body as T;
}
