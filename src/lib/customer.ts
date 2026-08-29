"use client";

import { supabase } from "./supabase";
import { askAI } from "./askAI";
import type { World } from "./world";
import type { Drop } from "./drops";

/**
 * WHO THIS WORLD'S CUSTOMER IS, KEPT.
 *
 * The chat used to build a person from scratch on every message out of a
 * world name and a handful of keywords, which is why it said much the same
 * thing whatever the niche. This is the person, written down once and read
 * back verbatim every time, so it is the same someone on Tuesday as it was
 * last week.
 */

export interface Person {
  name?: string;
  age?: string;
  life?: string;
  how_they_got_here?: string;
}

export interface Fluency {
  sub_worlds?: string[];
  adjacent?: string[];
  current?: string[];
  cool?: string[];
  cringe?: string[];
  buys?: string[];
  never?: string[];
  register?: string[];
  seams?: string[];
}

export interface CustomerProfile {
  person: Person;
  fluency: Fluency;
  learned: string[];
  builtAt: string;
  builtFrom: Record<string, number>;
}

export async function loadCustomer(
  worldId: string,
): Promise<CustomerProfile | null> {
  const { data } = await supabase
    .from("wb_world_customer")
    .select("person, fluency, learned, built_at, built_from")
    .eq("world_id", worldId)
    .maybeSingle();
  if (!data) return null;
  return {
    person: (data.person ?? {}) as Person,
    fluency: (data.fluency ?? {}) as Fluency,
    learned: (data.learned ?? []) as string[],
    builtAt: data.built_at as string,
    builtFrom: (data.built_from ?? {}) as Record<string, number>,
  };
}

export async function buildCustomer(worldId: string) {
  return askAI<{ person: Person; fluency: Fluency }>(
    "/api/customer/build",
    { worldId },
    { timeoutMs: 180_000 },
  );
}

/**
 * Something the customer said about themselves that has to stay true.
 *
 * A person accumulates. Asked their sister's name once and answering "Dana",
 * they cannot be talking about Steph next month — that is the difference
 * between a character and a slot machine. Capped, because this is peripheral
 * detail and not a transcript.
 */
const MOST_LEARNED = 40;

export async function rememberAboutCustomer(worldId: string, facts: string[]) {
  if (!facts.length) return;
  const { data } = await supabase
    .from("wb_world_customer")
    .select("learned")
    .eq("world_id", worldId)
    .maybeSingle();
  if (!data) return;
  const held = (data.learned ?? []) as string[];
  const merged = [...held, ...facts.filter((f) => !held.includes(f))].slice(
    -MOST_LEARNED,
  );
  await supabase
    .from("wb_world_customer")
    .update({ learned: merged, updated_at: new Date().toISOString() })
    .eq("world_id", worldId);
}

const list = (label: string, xs?: string[]) =>
  xs?.length ? [`${label}:`, ...xs.map((x) => `- ${x}`)] : [];

/** The person, as the chat has to read them. */
export function asPrompt(p: CustomerProfile): string {
  const { person: me, fluency: f } = p;
  return [
    "WHO YOU ARE — this is fixed. Never contradict any of it.",
    me.name ? `Your name is ${me.name}.` : "",
    me.age ? `You are ${me.age}.` : "",
    me.life ?? "",
    me.how_they_got_here ? `How you ended up in this world: ${me.how_they_got_here}` : "",
    "",
    "YOU KNOW THIS WHOLE WORLD, NOT ONE CORNER OF IT.",
    "You move between all of the below and the parts next door. When you are asked about a corner you are not standing in, you still know it — that is what being from here means.",
    ...list("The corners of it you move between", f.sub_worlds),
    ...list("What bleeds in from next door", f.adjacent),
    ...list("What is live in this world right now", f.current),
    ...list("What lands, and why", f.cool),
    ...list("What is played out — say so bluntly when you see it", f.cringe),
    ...list("What you actually buy and wear, and what you pay", f.buys),
    ...list("What you would never wear", f.never),
    ...list("Where this world rubs against another", f.seams),
    "",
    "HOW YOU TYPE — this is your register, not a description of it. Sound like these:",
    ...(f.register ?? []).map((r) => `- ${r}`),
    ...(p.learned.length
      ? [
          "",
          "THINGS YOU HAVE ALREADY SAID ABOUT YOURSELF — still true, never contradict them:",
          ...p.learned.map((l) => `- ${l}`),
        ]
      : []),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * WHERE THIS CONVERSATION IS STANDING.
 *
 * The chat sits beside two different drops depending on the tab: the one
 * being built, and the one being researched. Which corner of the world the
 * customer speaks from should follow that, without the seller operating a
 * control — the page already knows.
 *
 * They stay the same person. What changes is which part of their world is in
 * front of them.
 */
export function cornerFor(
  drop: Drop | undefined,
  intention: string,
  looking: "the drop being built" | "next week's research",
): string {
  if (!drop) return "";
  const lines = [
    "",
    `WHERE YOU ARE RIGHT NOW — ${looking}.`,
  ];
  if (intention.trim())
    lines.push(
      `What this one is about, in the seller's own words: ${intention.trim()}`,
      "Answer from inside that corner of your world. You are still you — same taste, same register — but this is the part of the world in front of you, so let it colour what you reach for.",
    );
  else
    lines.push(
      "Nothing has been written down about what this one is about yet, so answer from the world as a whole.",
    );
  return lines.join("\n");
}

export const isStale = (p: CustomerProfile, world: World) =>
  !p.person.name || !world;
