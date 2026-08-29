"use client";

import { useEffect, useRef, useState } from "react";
import type { World } from "@/lib/world";
import type { Drop } from "@/lib/drops";
import { askAI, LimitReached } from "@/lib/askAI";
import { buildWorldContext } from "@/lib/context";
import {
  listThreads,
  loadMessages,
  openThread,
  readThread,
  startNewThread,
  type ThreadRef,
  recent,
  remember,
  type Msg,
} from "@/lib/memory";
import { report } from "@/lib/report";
import { Star } from "./ui";
import Said from "./Said";

/**
 * These openers decide what the room is for.
 *
 * The old set — "give me a few directions for the remaining slots", "I want
 * one design that feels completely unexpected" — made this an idea generator
 * waiting to be pointed at a board. That quietly hands creative authority to
 * the AI. These ask it to help the seller see what is already in front of
 * them instead.
 *
 * One of these used to ask where they were repeating themselves. That is the
 * wrong instinct for this business: on Etsy, variations of something that
 * works are how a shop grows, and a drop that hangs together is a collection
 * rather than a mistake. Repetition is a strategy here, not a smell.
 */
const OPENERS = [
  "What patterns do you notice across these designs?",
  "What is the strongest thing on this board, and why?",
  "What feels visually underrepresented here?",
  "What have I saved for next week that might be influencing this?",
  "Summarise the decisions I have already made about this drop.",
];

/**
 * Encode the board once, not once per message.
 *
 * Every send used to re-download all ten mockups and re-draw each one through
 * a canvas, which is a visible pause before the room even starts thinking. A
 * mockup's pixels do not change while it sits in a slot, so the encoded copy
 * is kept against the item id and only recomputed when the design itself is
 * replaced. The signed URL rotating is not a reason to redo the work.
 */
const encoded = new Map<string, string>();

/**
 * The room has to be able to SEE whatever it is being asked about.
 *
 * On the build tab that is the mockups in their slots. On the research tab it
 * is the pins on the board — and until now the room was handed the research
 * drop, which has no mockups at all, so the one place meant to look at your
 * collection was looking at ten empty squares. It read the written analysis
 * and pretended. Now it is given whichever set is actually in front of the
 * seller.
 */
export async function encodeAll(
  sources: { id: string; src: string | null }[],
): Promise<string[]> {
  const out: string[] = [];
  for (const item of sources.slice(0, 12)) {
    if (!item.src) continue;
    const hit = encoded.get(item.id);
    if (hit) {
      out.push(hit);
      continue;
    }
    try {
      const blob = await (await fetch(item.src)).blob();
      const b64 = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onerror = () => reject(new Error("bad image"));
        img.onload = () => {
          const scale = Math.min(1, 512 / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL("image/jpeg", 0.72).split(",")[1]);
        };
        img.src = url;
      });
      encoded.set(item.id, b64);
      out.push(b64);
    } catch {
      // One image that will not load is not worth failing the whole message.
    }
  }
  return out;
}

/** The mockups in a drop, in slot order. */
export function mockupSources(drop: Drop) {
  return [...drop.items]
    .sort((a, b) => a.slot - b.slot)
    .slice(0, 10)
    .map((i) => ({ id: i.id, src: i.src }));
}

export default function CreativeRoom({
  world,
  drop,
  drops = [],
  looksAt,
  subject = "mockups",
}: {
  world: World;
  drop: Drop;
  /** Everything released so far, so the Room knows the world's history. */
  drops?: Drop[];
  /**
   * What the room should actually look at. Left out on the build tab, where
   * the mockups in the drop are the subject; passed on the research tab,
   * where the pins are.
   */
  looksAt?: { id: string; src: string | null }[];
  subject?: "mockups" | "pins";
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /* A limit is not a failure. Same text, calmer frame. */
  const [capped, setCapped] = useState(false);
  const [ready, setReady] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  /*
    PAST CONVERSATIONS.

    A thread has always been kept per drop, so the thinking about Drop 03 was
    saved the moment it happened — there was just no door back to it once the
    week turned over. `past` is the list; `viewing` is the older thread being
    read, and while it is set the composer stands down, because a finished
    conversation about a finished drop is not one you add to.
  */
  const [past, setPast] = useState<ThreadRef[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [viewing, setViewing] = useState<ThreadRef | null>(null);
  const [viewMsgs, setViewMsgs] = useState<Msg[]>([]);

  // One thread per drop — the thinking stays attached to the board it was
  // about, so opening Drop 04 again brings back the conversation about it.
  useEffect(() => {
    setReady(false);
    loadMessages(world.id, "room", drop.id)
      .then(setMsgs)
      .catch(() => setMsgs([]))
      .finally(() => setReady(true));
  }, [world.id, drop.id]);

  useEffect(() => {
    /*
      Everything except the conversation currently on screen. That includes
      earlier threads for THIS drop, because "New chat" leaves the old one
      behind rather than destroying it.
    */
    Promise.all([listThreads(world.id, "room"), openThread(world.id, "room", drop.id)])
      .then(([all, current]) =>
        setPast(all.filter((t) => t.dropId && t.id !== current)),
      )
      .catch(() => setPast([]));
  }, [world.id, drop.id, msgs.length]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function openPast(t: ThreadRef) {
    setShowPast(false);
    setViewing(t);
    setViewMsgs(await readThread(t.id).catch(() => []));
  }

  /** "Drop 03", falling back to the date if that drop is gone. */
  function labelFor(t: ThreadRef) {
    const when = new Date(t.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const d = drops.find((x) => x.id === t.dropId);
    // The date is not decoration — one drop can hold several conversations.
    return d ? `Drop ${String(d.number).padStart(2, "0")} · ${when}` : when;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    setErr("");
    try {
      const sources = looksAt ?? mockupSources(drop);
      const images = await encodeAll(sources);
      const j = await askAI<{ text: string }>("/api/creative-room", {
        messages: recent(next),
        context: [
          await buildWorldContext(world, {
            room: "room",
            drops,
            currentDrop: drop,
            // The board researched for this drop, so the room can answer
            // "what have I already noticed about this week?"
            boardFor: drop.id,
          }),
          "",
          images.length
            ? subject === "pins"
              ? `The ${images.length} image${images.length === 1 ? "" : "s"} attached to this message are the pieces collected on this research board. They are references and things noticed — not the seller's own designs, and not decisions.`
              : `The images attached to this message are the ${images.length} mockup${images.length === 1 ? "" : "s"} on the board right now, in slot order.`
            : subject === "pins"
              ? "Nothing has been collected on this board yet."
              : "The board is still empty.",
        ].join("\n"),
        images,
      });
      const reply = { role: "assistant" as const, content: j.text };
      setMsgs([...next, reply]);
      setCapped(false);
      const thread = await openThread(world.id, "room", drop.id);
      await remember(thread, [{ role: "user", content }, reply]);
    } catch (e) {
      const limit = e instanceof LimitReached;
      // Not worth reporting: nothing is broken and nothing needs looking at.
      if (!limit) report("room", e, { worldId: world.id, dropId: drop.id });
      setErr(e instanceof Error ? e.message : "That did not go through.");
      setCapped(limit);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b-2 border-black px-4 py-3">
        <Star size={9} className="text-accent" />
        <span className="eyebrow">drop director</span>
        <span className="ml-auto text-[11px] text-ink-3">
          {/*
            On the research tab the drop has no mockups yet, so a "0/10" here
            read as a warning about work not done rather than as information.
            Count what is actually in front of us instead.
          */}
          {subject === "pins"
            ? `Drop ${String(drop.number).padStart(2, "0")} research`
            : `Drop ${String(drop.number).padStart(2, "0")} · ${drop.items.length}/${world.slotsPerDrop}`}
        </span>
        {past.length > 0 && (
          <button
            onClick={() => setShowPast((v) => !v)}
            className="t-small ml-2 shrink-0 text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            Earlier chats
          </button>
        )}
      </div>

      {showPast && (
        <div className="border-b border-black/12 bg-black/[0.02] px-3 py-2">
          {past.map((t) => (
            <button
              key={t.id}
              onClick={() => openPast(t)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 transition hover:bg-black/[0.05] hover:text-ink"
            >
              {labelFor(t)}
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <div className="flex items-center gap-2 border-b border-black/12 bg-black/[0.02] px-4 py-2">
          <span className="t-small font-semibold text-ink">
            {labelFor(viewing)}
          </span>
          <button
            onClick={() => setViewing(null)}
            className="t-small ml-auto text-ink-2 underline underline-offset-2 transition hover:text-ink"
          >
            Back
          </button>
        </div>
      )}

      <div className="min-h-[300px] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {viewing &&
          viewMsgs.map((m, i) =>
            m.role === "user" ? (
              <p
                key={i}
                className="ml-6 rounded-lg border-2 border-black bg-black px-3 py-2 text-sm font-medium leading-relaxed text-white"
              >
                {m.content}
              </p>
            ) : (
              <div
                key={i}
                className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2"
              >
                <Said text={m.content} />
              </div>
            ),
          )}

        {!viewing && ready && msgs.length === 0 && (
          <div>
            {/*
              Openers are offers, not calls to action. As bordered boxes with
              drop shadows they read as five buttons demanding a decision
              before you have looked at anything. Grey suggestions you can
              ignore is what they actually are.
            */}
            <p className="t-small text-ink-3">
              I can see your board. Talk to me while you look at it.
            </p>
            <div className="mt-3 space-y-0.5">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  onClick={() => send(o)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-snug text-ink-3 transition hover:bg-black/[0.04] hover:text-ink"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {!viewing && msgs.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-6 rounded-lg border-2 border-black bg-black px-3 py-2 text-sm font-medium leading-relaxed text-white"
            >
              {m.content}
            </p>
          ) : (
            <div
              key={i}
              className="whitespace-pre-wrap text-sm leading-relaxed text-ink-2"
            >
              <Said text={m.content} />
            </div>
          ),
        )}

        {!viewing && busy && (
          <p className="pulse-soft t-small text-ink-3">Looking at the board…</p>
        )}
        {err && (
          <p
            className={
              capped
                ? "t-small rounded-lg bg-black/[0.04] px-3 py-2 text-ink-2"
                : "rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8a2020]"
            }
          >
            {err}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className={`border-t-2 border-black p-3 ${viewing ? "hidden" : ""}`}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={2}
          placeholder="Talk about this drop…"
          className="field resize-none"
        />
        <button
          onClick={() => send(draft)}
          disabled={busy || !draft.trim()}
          className="btn btn-primary mt-2 w-full"
        >
          Send
        </button>
        {msgs.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={async () => {
                setMsgs([]);
                await startNewThread(world.id, "room", drop.id);
                setPast(
                  (await listThreads(world.id, "room")).filter((t) => t.dropId),
                );
              }}
              className="t-small text-ink-3 transition hover:text-ink"
            >
              New chat
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
