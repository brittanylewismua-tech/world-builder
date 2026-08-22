"use client";

import { useEffect, useRef, useState } from "react";
import Shell from "@/components/Shell";
import { Sparkle } from "@/components/Globe";
import { loadIssue, todayISO, type DailyItem } from "@/lib/daily";
import type { World } from "@/lib/world";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const PROMPTS = [
  "What are you doing this weekend?",
  "What are you obsessed with right now?",
  "Where do you shop?",
  "What are you wearing lately?",
  "What are you sick of seeing?",
  "What do you and your friends send each other?",
  "What do you spend way too much money on?",
  "What are you saving on Pinterest lately?",
  "What do you buy before an event?",
  "What are you excited about next month?",
];

export default function Customer() {
  return <Shell>{(world) => <CustomerBody world={world} />}</Shell>;
}

function CustomerBody({ world }: { world: World }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

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

  function context() {
    const lines = [
      `World: ${world.name}`,
      `The kinds of things people in this world search for and buy: ${world.subNiches.map((s) => s.keyword).join(" · ") || "unknown"}`,
      `Parts of this world that matter: ${world.areas.map((a) => a.name).join(" · ") || "unknown"}`,
    ];
    if (daily.length) {
      lines.push(
        `\nHAPPENING IN THIS WORLD RIGHT NOW (from today's research — you would plausibly know about these):`,
        ...daily.map((d) => `- ${d.headline}. ${d.body}`),
      );
    }
    return lines.join("\n");
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
      const r = await fetch("/api/customer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, context: context() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "That did not go through.");
      setMsgs([...next, { role: "assistant", content: j.text }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="border-b border-pink/25 pb-5">
        <div className="flex items-center gap-2 text-pink">
          <Sparkle size={11} />
          <span className="eyebrow">Talk to your customer</span>
        </div>
        <h1 className="display mt-3 text-[clamp(1.6rem,4vw,2.4rem)] text-paper">
          World: {world.name}
        </h1>
        <p className="mt-3 text-xs leading-relaxed text-smoke">
          A research-informed simulation of someone who lives in this world. She
          is one plausible person, not market truth — useful for thinking from
          inside her life, never as evidence.
          {daily.length > 0 &&
            " She knows what is in today's World Daily."}
        </p>
      </div>

      <div className="min-h-[40vh] space-y-5 py-7">
        {msgs.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="border border-paper/12 px-3 py-2.5 text-left text-[13px] leading-snug text-paper/75 transition hover:border-pink/60 hover:text-pink"
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
              className="ml-auto max-w-[80%] bg-pink/15 px-4 py-2.5 text-right text-sm leading-relaxed text-paper"
            >
              {m.content}
            </p>
          ) : (
            <p
              key={i}
              className="max-w-[85%] whitespace-pre-wrap border-l-2 border-pink px-4 py-2.5 text-[15px] leading-relaxed text-paper/90"
            >
              {m.content}
            </p>
          ),
        )}

        {busy && <p className="pulse-soft text-sm text-pink">typing…</p>}
        {err && (
          <p className="border-l-2 border-pink bg-pink/10 px-4 py-3 text-sm text-paper">
            {err}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="sticky bottom-4">
        <div className="flex gap-2 border border-pink/25 bg-black/90 p-2 backdrop-blur">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(draft)}
            placeholder="Ask her anything…"
            className="w-full bg-transparent px-3 py-2 text-sm text-paper outline-none placeholder:text-smoke/50"
          />
          <button
            onClick={() => send(draft)}
            disabled={busy || !draft.trim()}
            className="display shrink-0 bg-pink px-5 text-base text-black transition hover:bg-pink-hot disabled:bg-paper/10 disabled:text-smoke"
          >
            Ask
          </button>
        </div>
        {msgs.length > 0 && (
          <button
            onClick={() => setMsgs([])}
            className="eyebrow mt-3 text-smoke transition hover:text-pink"
          >
            Start over
          </button>
        )}
      </div>
    </main>
  );
}
