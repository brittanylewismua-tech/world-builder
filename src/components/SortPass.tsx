"use client";

import { useEffect, useState } from "react";
import {
  SECTIONS,
  updateItem,
  type BoardItem,
  type Section,
} from "@/lib/board";

/**
 * WHY DID YOU SAVE THIS?
 *
 * The board used to file pins on its own, and it was wrong often enough to be
 * worse than useless: a model can see that an image is hand-lettered type on a
 * pink tee, but not whether the seller pinned it for the words, the layout or
 * the colour. Only she knows that, and she knows it instantly.
 *
 * So the question gets asked properly — one piece at a time, big enough to
 * actually look at, with the four answers under it. Multiple answers allowed,
 * because "the quote AND the layout" is the honest answer more often than not.
 *
 * Speed is the whole point. Forty pins have to take a minute, not forty trips
 * through a dropdown, or nobody will ever sort anything and the lanes will sit
 * empty. Hence number keys, Enter to advance, and an escape hatch on every
 * screen — a sorting pass you cannot abandon is a chore, not a tool.
 */
export default function SortPass({
  items,
  aiHints = true,
  onDone,
  onSorted,
}: {
  /** The unsorted pieces, in the order they will be shown. */
  items: BoardItem[];
  /** Show the model's guess as a faint dot. It still never files anything. */
  aiHints?: boolean;
  onDone: () => void;
  /** Fired per piece so the board behind updates as she goes. */
  onSorted: (id: string, sections: Section[]) => void;
}) {
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<Section[]>([]);
  const [saving, setSaving] = useState(false);

  const item = items[at];
  const left = items.length - at;

  const toggle = (s: Section) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  async function commit(sections: Section[]) {
    if (!item || saving) return;
    setSaving(true);
    try {
      if (sections.length) {
        await updateItem(item.id, { sections });
        onSorted(item.id, sections);
      }
      setPicked([]);
      if (at + 1 >= items.length) onDone();
      else setAt(at + 1);
    } finally {
      setSaving(false);
    }
  }

  /*
    Number keys pick a lane, Enter moves on, Escape leaves. Anyone sorting
    forty pins will find these within the first five and go four times faster
    for the rest — and anyone who never finds them loses nothing.
  */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return onDone();
      if (e.key === "Enter") return void commit(picked);
      const n = Number(e.key);
      if (n >= 1 && n <= SECTIONS.length) toggle(SECTIONS[n - 1].id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!item) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sort your research"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onDone}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-center gap-2 border-b-2 border-black px-4 py-2.5">
          <span className="eyebrow">why did you save this?</span>
          <span className="ml-auto t-small tabular-nums text-ink-3">
            {left} to go
          </span>
          <button
            onClick={onDone}
            className="t-small ml-2 text-ink-3 transition hover:text-ink"
          >
            Done for now
          </button>
        </div>

        <div className="flex max-h-[46vh] items-center justify-center bg-[#faf9f8] p-4">
          {item.kind === "image" && item.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.src}
              alt=""
              className="max-h-[42vh] w-auto rounded-lg border border-black/10"
            />
          ) : (
            <p className="py-6 text-center text-[17px] font-medium leading-snug text-ink">
              {item.body || item.note || item.sourceLabel}
            </p>
          )}
        </div>

        {item.note && item.kind === "image" && (
          <p className="t-small border-t border-black/10 px-4 py-2 text-ink-3">
            {item.note}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-black/10 p-3">
          {SECTIONS.map((s, i) => {
            const on = picked.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggle(s.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[14px] font-medium transition ${
                  on
                    ? "border-black bg-black text-white"
                    : "border-black/15 bg-white text-ink hover:border-black"
                }`}
              >
                <span
                  className={`text-[11px] tabular-nums ${
                    on ? "text-white/50" : "text-ink-3"
                  }`}
                >
                  {i + 1}
                </span>
                {s.name}
                {aiHints && !on && item.aiSection === s.id && (
                  <span
                    title="What the AI would have guessed. It is only a guess."
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 border-t border-black/10 px-3 py-2.5">
          <button
            onClick={() => commit(picked)}
            disabled={saving || picked.length === 0}
            className="btn btn-primary disabled:opacity-40"
          >
            {at + 1 >= items.length ? "Save and finish" : "Save and next"}
          </button>
          <button
            onClick={() => commit([])}
            disabled={saving}
            className="t-small text-ink-3 underline underline-offset-2 transition hover:text-ink"
          >
            Skip
          </button>
          <span className="t-small ml-auto hidden text-ink-3 sm:block">
            1–4 to pick · enter to save
          </span>
        </div>
      </div>
    </div>
  );
}
