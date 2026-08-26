"use client";

import { supabase } from "./supabase";

/**
 * MEMORY
 *
 * The portal should get more useful the longer someone lives in it. Until now
 * both conversations evaporated on refresh, which quietly contradicted that.
 *
 * Two threads are kept:
 *   customer — one per world, ongoing. She remembers what you have talked about.
 *   room     — one per drop, so the thinking stays attached to the work.
 *
 * SPEC guard: this is memory the AI carries behind the scenes, not a surface.
 * No transcript dashboard, no "everything we know about your customer" map.
 */

export interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** How much history goes back to the model. Enough to feel remembered. */
const CONTEXT_TURNS = 24;
/** How much history is loaded onto the screen. */
const SCREEN_TURNS = 120;

async function findThread(worldId: string, kind: "customer" | "room", dropId?: string) {
  let q = supabase
    .from("wb_conversations")
    .select("id")
    .eq("world_id", worldId)
    .eq("kind", kind);
  q = dropId ? q.eq("drop_id", dropId) : q.is("drop_id", null);
  /*
    Newest wins. There can be more than one thread for the same drop now —
    "New chat" opens a fresh one rather than deleting what came before — so
    the current conversation is the most recently touched, and the older ones
    stay readable under "past".
  */
  const { data } = await q.order("updated_at", { ascending: false }).limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}

/** The thread's id, creating it the first time someone speaks. */
export async function openThread(
  worldId: string,
  kind: "customer" | "room",
  dropId?: string,
): Promise<string> {
  const existing = await findThread(worldId, kind, dropId);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("wb_conversations")
    .insert({ world_id: worldId, kind, drop_id: dropId ?? null })
    .select("id")
    .single();

  // A racing tab may have created it a moment ago; take theirs.
  if (error) {
    const again = await findThread(worldId, kind, dropId);
    if (again) return again;
    throw new Error(error.message);
  }
  return data.id as string;
}

export async function loadMessages(
  worldId: string,
  kind: "customer" | "room",
  dropId?: string,
): Promise<Msg[]> {
  const id = await findThread(worldId, kind, dropId);
  if (!id) return [];
  return readThread(id);
}

/**
 * The last SCREEN_TURNS messages of a thread, oldest first.
 *
 * This used to order ascending and then limit, which on a long thread hands
 * back the FIRST hundred and twenty messages and never the recent ones — the
 * conversation would silently freeze at its own beginning. Take the tail, then
 * put it back in reading order.
 */
export async function readThread(threadId: string): Promise<Msg[]> {
  const { data, error } = await supabase
    .from("wb_messages")
    .select("role, content")
    .eq("conversation_id", threadId)
    .order("created_at", { ascending: false })
    .limit(SCREEN_TURNS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Msg[]).reverse();
}

export interface ThreadRef {
  id: string;
  dropId: string | null;
  updatedAt: string;
}

/**
 * Every conversation of this kind in the world, newest first.
 *
 * The Director keeps one thread per drop, so last week's thinking is already
 * saved — there was simply no way to reach it once the drop moved on.
 */
export async function listThreads(
  worldId: string,
  kind: "customer" | "room",
): Promise<ThreadRef[]> {
  const { data, error } = await supabase
    .from("wb_conversations")
    .select("id, drop_id, updated_at")
    .eq("world_id", worldId)
    .eq("kind", kind)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    dropId: (r.drop_id as string | null) ?? null,
    updatedAt: r.updated_at as string,
  }));
}

/**
 * Store one exchange. Never throws into the UI — losing a saved line is worth
 * far less than interrupting someone mid-thought with an error banner.
 */
export async function remember(threadId: string, msgs: Msg[]) {
  try {
    await supabase
      .from("wb_messages")
      .insert(msgs.map((m) => ({ conversation_id: threadId, ...m })));
    await supabase
      .from("wb_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", threadId);
  } catch {
    /* the conversation on screen is still correct */
  }
}

/**
 * Put the current conversation away and start a clean one.
 *
 * Deliberately not a delete. "New chat" that quietly destroys the last one is
 * a lie the moment there is a history to look back through — the old thread
 * keeps its messages and simply stops being the newest.
 */
export async function startNewThread(
  worldId: string,
  kind: "customer" | "room",
  dropId?: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("wb_conversations")
    .insert({ world_id: worldId, kind, drop_id: dropId ?? null })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function forget(worldId: string, kind: "customer" | "room", dropId?: string) {
  const id = await findThread(worldId, kind, dropId);
  if (!id) return;
  await supabase.from("wb_conversations").delete().eq("id", id);
}

/** The tail of a thread, trimmed to what is worth sending to the model. */
export const recent = (msgs: Msg[]) => msgs.slice(-CONTEXT_TURNS);
