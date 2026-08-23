"use client";

import { useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { Star } from "@/components/ui";
import { loadIssue, todayISO, type DailyItem } from "@/lib/daily";
import {
  forget,
  loadMessages,
  openThread,
  recent,
  remember,
  type Msg,
} from "@/lib/memory";
import { askAI } from "@/lib/askAI";
import { buildWorldContext } from "@/lib/context";
import type { World } from "@/lib/world";
import { report } from "@/lib/report";

/**
 * Six at a time, not ten. A screen of ten questions reads as a survey; six
 * reads as the start of a conversation. The rest rotate in on each visit so
 * the same six are not the only doors that ever open.
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

function sixOf(list: string[]) {
  const keep = list.slice(0, 5);
  const rest = list.slice(5);
  return [...keep, rest[Math.floor(Math.random() * rest.length)]];
}

export default function Customer() {
  return <Shell>{(world) => <CustomerBody world={world} />}</Shell>;
}

function CustomerBody({ world }: { world: World }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [starters] = useState(() => sixOf(PROMPTS));
  const endRef = useRef<HTMLDivElement>(null);

  // She remembers. Everything said before is loaded back in and travels with
  // the next message, so the conversation picks up rather than restarting.
  useEffect(() => {
    loadMessages(world.id, "customer")
      .then(setMsgs)
      .catch(() => setMsgs([]))
      .finally(() => setReady(true));
  }, [world.id]);

  // Today's issue gets folded in, so she can reference what is actually
  // happening in her world right now.
  useEffect(() => {
    loadIssue(world.id, todayISO())
      .then(setDaily)
      .catch(() => setDaily([]));
  }, [world.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  /** Everything the world knows, assembled fresh for each message. */
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

  /**
   * Sending is split from delivering so a failure can be retried without
   * losing what was typed. On failure the message stays on screen exactly
   * where it was and the person is offered the send again, rather than
   * being handed an error and an empty box.
   */
  async function deliver(all: Msg[]) {
    const asked = all[all.length - 1]?.content ?? "";
    setBusy(true);
    setErr("");
    try {
      const j = await askAI<{ text: string }>(
        "/api/customer",
        { messages: recent(all), context: await context() },
        { timeoutMs: 90_000 },
      );
      const reply = { role: "assistant" as const, content: j.text };
      setMsgs([...all, reply]);
      setStuck(false);
      const thread = await openThread(world.id, "customer");
      await remember(thread, [{ role: "user", content: asked }, reply]);
    } catch (e) {
      report("customer", e, { worldId: world.id, turns: all.length });
      setErr(e instanceof Error ? e.message : "That did not go through.");
      setStuck(true);
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
    <main className="mx-auto max-w-2xl px-5 py-8 md:px-8">
      <div className="mb-6 border-b-2 border-black pb-5">
        <div className="flex items-center gap-1.5 text-ink-3">
          <Star size={9} className="text-accent" />
          <span className="eyebrow">Talk to your customer</span>
        </div>
        <h1 className="t-h1 mt-2 text-ink">
          {world.name.trim() ? (
            <>
              talking to someone inside{" "}
              <span className="italic" style={{ color: "var(--accent)" }}>
                {world.name.toLowerCase()}
              </span>
            </>
          ) : (
            "talk to the customer"
          )}
        </h1>
        <span className="rule-accent mt-3" />
        <p className="t-small mt-2 text-ink-2">
          A research-informed simulation of someone who lives in this world. She
          is one plausible person, not market truth — useful for thinking from
          inside her life, never as evidence.
          {daily.length > 0 &&
            " She knows what is in today's World Daily."}
        </p>
      </div>

      <div className="min-h-[40vh] space-y-5 py-7">
        {ready && msgs.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {starters.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="card card-hover px-3.5 py-3 text-left text-[13px] font-medium leading-snug"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {msgs.map((m, i) =>
          m.role === "user" ? (
            <p
              key={i}
              className="ml-auto max-w-[80%] rounded-xl border-2 border-black bg-black px-4 py-2.5 text-sm font-medium leading-relaxed text-white shadow-[3px_3px_0_var(--accent)]"
            >
              {m.content}
            </p>
          ) : (
            <p
              key={i}
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-black/12 bg-white px-4 py-3 text-[15px] leading-relaxed text-ink"
            >
              {m.content}
            </p>
          ),
        )}

        {busy && (
          <p aria-live="polite" className="pulse-soft t-small text-ink-3">
            typing…
          </p>
        )}
        {err && (
          <div
            role="alert"
            className="rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-4 py-3 text-sm text-[#8a2020]"
          >
            <p>{err}</p>
            {stuck && !busy && msgs.length > 0 && (
              <button
                onClick={() => deliver(msgs)}
                className="mt-2 font-semibold underline underline-offset-2"
              >
                Send it again
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-4">
        <div className="card flex gap-2 p-2 shadow-[4px_4px_0_var(--accent)]">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(draft)}
            placeholder="Ask her anything…"
            className="w-full bg-transparent px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3"
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
          <button
            onClick={async () => {
              if (
                !window.confirm(
                  "Clear this conversation? She will forget everything you have talked about.",
                )
              )
                return;
              setMsgs([]);
              await forget(world.id, "customer");
            }}
            className="t-small mt-3 text-ink-3 transition hover:text-ink"
          >
            Start over
          </button>
        )}
      </div>
    </main>
  );
}
