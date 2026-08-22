"use client";

import { useEffect, useRef, useState } from "react";
import type { World } from "@/lib/world";
import type { Drop } from "@/lib/drops";
import { formatDropDate } from "@/lib/drops";
import { Star, Dots } from "./ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const OPENERS = [
  "I'm stuck on the last three.",
  "These are starting to feel repetitive.",
  "I want one design that feels completely unexpected.",
  "Give me a few directions for the remaining slots.",
  "I want to add hats to this drop.",
];

/** Everything the Room knows, assembled fresh on every send. */
function buildContext(world: World, drop: Drop) {
  const lines = [
    `World: ${world.name}`,
    `Validated sub-niches the seller researched in eRank (${world.subNiches.length}): ${world.subNiches.map((s) => s.keyword).join(" · ") || "none yet"}`,
    `Areas they watch: ${world.areas.map((a) => a.name).join(" · ") || "none yet"}`,
    `Visual calibration on file: ${world.visualReferences.length} reference designs the seller said they love. Treat as style direction only — never as designs to copy, and never as evidence of demand.`,
    `Current board: DROP ${drop.number}, publishing ${formatDropDate(drop.publishDate)}, ${drop.items.length} of ${world.slotsPerDrop} slots filled.`,
    drop.items.length
      ? `The images attached to this message are the ${drop.items.length} mockup${drop.items.length === 1 ? "" : "s"} currently on the board, in slot order.`
      : `The board is still empty.`,
  ];
  return lines.join("\n");
}

/** Fetch signed mockup URLs and shrink them for the vision call. */
async function boardImages(drop: Drop): Promise<string[]> {
  const sorted = [...drop.items].sort((a, b) => a.slot - b.slot).slice(0, 10);
  const out: string[] = [];
  for (const item of sorted) {
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
      out.push(b64);
    } catch {
      // A mockup that will not load is not worth failing the whole message over.
    }
  }
  return out;
}

export default function CreativeRoom({
  world,
  drop,
}: {
  world: World;
  drop: Drop;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setDraft("");
    setBusy(true);
    setErr("");
    try {
      const images = await boardImages(drop);
      const r = await fetch("/api/creative-room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: next,
          context: buildContext(world, drop),
          images,
        }),
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
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b-2 border-black px-4 py-3">
        <Star size={9} className="text-accent" />
        <span className="eyebrow">creative room</span>
        <span className="ml-auto text-[11px] text-ink-3">
          Drop {String(drop.number).padStart(2, "0")} · {drop.items.length}/
          {world.slotsPerDrop}
        </span>
      </div>

      <div className="min-h-[300px] flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div>
            <p className="t-small text-ink-2">
              I can see the board and everything in your World Profile. Talk to
              me while you look at it.
            </p>
            <div className="mt-4 space-y-2">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  onClick={() => send(o)}
                  className="block w-full rounded-lg border-2 border-black bg-white px-3 py-2 text-left text-[13px] font-medium leading-snug shadow-[2px_2px_0_rgba(0,0,0,0.15)] transition hover:shadow-[3px_3px_0_var(--accent)]"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) =>
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
              {m.content}
            </div>
          ),
        )}

        {busy && (
          <p className="pulse-soft t-small text-accent-ink">Looking at the board…</p>
        )}
        {err && (
          <p className="rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-3 py-2 text-sm text-[#8a2020]">
            {err}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t-2 border-black p-3">
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
      </div>
    </div>
  );
}
