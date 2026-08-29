"use client";

import { useEffect, useRef, useState } from "react";
import { Star } from "./ui";
import Said from "./Said";
import { loadIssue, weekStartISO, type DailyItem } from "@/lib/daily";
import {
  listThreads,
  loadMessages,
  openThread,
  readThread,
  recent,
  remember,
  startNewThread,
  type Msg,
  type ThreadRef,
} from "@/lib/memory";
import { askAI, LimitReached } from "@/lib/askAI";
import { buildWorldContext } from "@/lib/context";
import { report } from "@/lib/report";
import type { World } from "@/lib/world";
import type { Drop } from "@/lib/drops";
import { encodeAll, mockupSources } from "./CreativeRoom";

/**
 * THE CUSTOMER, BESIDE THE BOARD.
 *
 * She used to have her own page, which meant deciding to go and talk to her —
 * a separate errand rather than something you do mid-thought while looking at
 * a pin and wondering whether she would actually say that. This is the same
 * conversation, same memory, sized to sit in a panel.
 *
 * She sees the DESIGNS in the drop, because "would you actually wear this" is
 * worth far more pointed at a real mockup than asked in the abstract — but
 * she never sees the research board. Research is the seller's thinking, and a
 * person shown somebody's working-out starts commenting on the working-out.
 * Finished designs are just products in a shop, which is a thing a customer
 * has every right to an opinion about.
 */
const PROMPTS = [
  "What are you doing this weekend?",
  "What are you sick of seeing?",
  "What do you and your friends send each other?",
  "What are you saving lately?",
  "What are you excited about next month?",
  "What are you wearing lately?",
  "What are you obsessed with right now?",
  "Where do you shop?",
  "What do you spend way too much money on?",
  "What do you buy before an event?",
];

function fourOf(list: string[]) {
  const keep = list.slice(0, 3);
  const rest = list.slice(3);
  return [...keep, rest[Math.floor(Math.random() * rest.length)]];
}

export default function CustomerChat({
  world,
  drop,
}: {
  world: World;
  /** The drop being built. She is shown its designs, nothing else. */
  drop?: Drop;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [stuck, setStuck] = useState(false);
  /* A limit is not a failure. Same text, calmer frame, no retry offered. */
  const [capped, setCapped] = useState(false);
  const [err, setErr] = useState("");
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const [ready, setReady] = useState(false);
  const [starters] = useState(() => fourOf(PROMPTS));
  const endRef = useRef<HTMLDivElement>(null);

  /*
    EVERY CONVERSATION YOU HAVE HAD WITH THIS PERSON.

    "New chat" already archived the old thread rather than destroying it —
    there was simply no door back to it, so every previous conversation was
    silently buried the moment a new one started. The Director had this and
    the customer did not.

    `earlier` is the list; `viewing` is an older one being read, and while it
    is open the composer stands down. You do not add to a conversation you
    finished last Tuesday.
  */
  const [earlier, setEarlier] = useState<ThreadRef[]>([]);
  const [showEarlier, setShowEarlier] = useState(false);
  const [viewing, setViewing] = useState<ThreadRef | null>(null);
  const [viewMsgs, setViewMsgs] = useState<Msg[]>([]);

  const refreshEarlier = async () => {
    try {
      const [all, current] = await Promise.all([
        listThreads(world.id, "customer"),
        openThread(world.id, "customer"),
      ]);
      setEarlier(all.filter((t) => t.id !== current));
    } catch {
      setEarlier([]);
    }
  };

  useEffect(() => {
    refreshEarlier();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world.id, msgs.length]);

  async function openEarlier(t: ThreadRef) {
    setShowEarlier(false);
    setViewing(t);
    setViewMsgs(await readThread(t.id).catch(() => []));
  }

  /** A conversation is named by when it happened. There is nothing else. */
  const whenOf = (t: ThreadRef) =>
    new Date(t.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });

  useEffect(() => {
    loadMessages(world.id, "customer")
      .then(setMsgs)
      .catch(() => setMsgs([]))
      .finally(() => setReady(true));
  }, [world.id]);

  useEffect(() => {
    loadIssue(world.id, weekStartISO())
      .then(setDaily)
      .catch(() => setDaily([]));
  }, [world.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function context() {
    const shared = await buildWorldContext(world, { room: "customer" });
    if (!daily.length) return shared;
    return [
      shared,
      "",
      "IN TODAY'S PAPER — you would plausibly know about these:",
      ...daily.map((d) => `- ${d.headline}. ${d.body}`),
    ].join("\n");
  }

  async function deliver(all: Msg[]) {
    const asked = all[all.length - 1]?.content ?? "";
    setBusy(true);
    setErr("");
    try {
      const j = await askAI<{ text: string }>(
        "/api/customer",
        {
          messages: recent(all),
          context: await context(),
          images: drop ? await encodeAll(mockupSources(drop)) : [],
        },
        { timeoutMs: 90_000 },
      );
      const reply = { role: "assistant" as const, content: j.text };
      setMsgs([...all, reply]);
      setStuck(false);
      setCapped(false);
      const thread = await openThread(world.id, "customer");
      await remember(thread, [{ role: "user", content: asked }, reply]);
    } catch (e) {
      const limit = e instanceof LimitReached;
      // Not worth reporting: nothing is broken and nothing needs looking at.
      if (!limit) report("customer", e, { worldId: world.id, turns: all.length });
      setErr(e instanceof Error ? e.message : "That did not go through.");
      setCapped(limit);
      setStuck(!limit);
    } finally {
      setBusy(false);
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setDraft("");
    deliver(next);
  }

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b-2 border-black px-4 py-3">
        <Star size={9} className="text-accent" />
        <span className="eyebrow">your customer</span>
        {earlier.length > 0 && (
          <button
            onClick={() => setShowEarlier((v) => !v)}
            className="t-small ml-auto shrink-0 text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            Earlier chats
          </button>
        )}
      </div>

      {showEarlier && (
        <div className="border-b border-black/12 bg-black/[0.02] px-3 py-2">
          {earlier.map((t) => (
            <button
              key={t.id}
              onClick={() => openEarlier(t)}
              className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 transition hover:bg-black/[0.05] hover:text-ink"
            >
              {whenOf(t)}
            </button>
          ))}
        </div>
      )}

      {viewing && (
        <div className="flex items-center gap-2 border-b border-black/12 bg-black/[0.02] px-4 py-2">
          <span className="t-small font-semibold text-ink">
            {whenOf(viewing)}
          </span>
          <button
            onClick={() => {
              setViewing(null);
              setViewMsgs([]);
            }}
            className="t-small ml-auto text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            Back to now
          </button>
        </div>
      )}

      <div className="min-h-[300px] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {ready && !viewing && msgs.length === 0 && (
          <>
            <p className="t-small text-ink-3">
              One person who lives in this world. They can see the designs in
              this drop, the way a shopper would.
            </p>
            <div className="space-y-0.5">
              {starters.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="block w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-snug text-ink-3 transition hover:bg-black/[0.04] hover:text-ink"
                >
                  {p}
                </button>
              ))}
            </div>
          </>
        )}

        {(viewing ? viewMsgs : msgs).map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-auto max-w-[85%] rounded-xl border-2 border-black bg-black px-3.5 py-2 text-[13px] font-medium leading-relaxed text-white"
            >
              {m.content}
            </p>
          ) : (
            <p
              key={i}
              className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-black/12 bg-white px-3.5 py-2.5 text-[14px] leading-relaxed text-ink"
            >
              <Said text={m.content} />
            </p>
          ),
        )}

        {busy && (
          <p aria-live="polite" className="pulse-soft t-small text-ink-3">
            typing…
          </p>
        )}
        {err && capped && (
          <p className="t-small rounded-lg bg-black/[0.04] px-3 py-2 text-ink-2">
            {err}
          </p>
        )}
        {err && !capped && (
          <div
            role="alert"
            className="rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-3 py-2 text-[13px] text-[#8a2020]"
          >
            <p>{err}</p>
            {stuck && !busy && msgs.length > 0 && (
              <button
                onClick={() => deliver(msgs)}
                className="mt-1.5 font-semibold underline underline-offset-2"
              >
                Send it again
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/*
        Reading an old conversation is reading, not continuing. The composer
        goes away rather than sitting there inviting a reply that would land
        in a different thread than the one on screen.
      */}
      {!viewing && (
      <div className="border-t border-black/12 p-3">
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(draft)}
            placeholder="Ask your customer anything…"
            className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-black"
          />
          <button
            onClick={() => send(draft)}
            disabled={busy || !draft.trim()}
            className="btn btn-primary shrink-0"
          >
            Ask
          </button>
        </div>
        {msgs.length > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              onClick={async () => {
                setMsgs([]);
                await startNewThread(world.id, "customer");
                await refreshEarlier();
              }}
              className="t-small text-ink-3 transition hover:text-ink"
            >
              New chat
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
