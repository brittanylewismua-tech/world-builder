"use client";

import { useRef, useState } from "react";
import {
  AFFINITY_QUESTIONS,
  MIN_SUB_NICHES,
  SUGGESTED_VISUAL_REFERENCES,
  type Affinity,
  type SubNiche,
  type VisualReference,
  type WorldArea,
} from "@/lib/world";

/* ------------------------------------------------------------------ */
/* W — WORK UP FROM DEMAND                                             */
/* ------------------------------------------------------------------ */

export function SubNicheInput({
  subNiches,
  onAdd,
  onRemove,
}: {
  subNiches: SubNiche[];
  onAdd: (keyword: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const remaining = Math.max(0, MIN_SUB_NICHES - subNiches.length);

  async function add() {
    const keyword = draft.trim();
    if (!keyword || busy) return;
    setBusy(true);
    setDraft("");
    await onAdd(keyword);
    setBusy(false);
  }

  return (
    <div>
      <div className="hairline mb-5 bg-pink/5 px-4 py-3 text-sm leading-relaxed text-paper/85">
        These should already have been validated by you inside eRank. This tool
        does not check demand or competition — it takes your word for it,
        because your research is the part that has to be real.
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="jesus loves you shirt"
          className="hairline w-full bg-black/60 px-4 py-3 text-base text-paper outline-none placeholder:text-smoke/50 focus:border-pink"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || busy}
          className="display shrink-0 bg-pink px-6 text-lg text-black transition hover:bg-pink-hot disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-smoke"
        >
          Add
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="display text-3xl text-pink">{subNiches.length}</span>
        <span className="text-sm text-smoke">
          {remaining > 0
            ? `${remaining} more to reach the minimum of ${MIN_SUB_NICHES}`
            : "validated sub-niches — no cap, add more any time"}
        </span>
      </div>

      {subNiches.length > 0 && (
        <ul className="mt-5 space-y-2">
          {subNiches.map((s, i) => (
            <li
              key={s.id}
              className="rise flex items-center gap-3 border border-paper/12 px-4 py-2.5"
            >
              <span className="display w-7 shrink-0 text-pink/50">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1 text-[15px] text-paper/90">
                {s.keyword}
              </span>
              <button
                onClick={() => onRemove(s.id)}
                className="shrink-0 text-[10px] uppercase tracking-widest text-smoke/50 transition hover:text-pink"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* O — OWN THE WORLD                                                   */
/* ------------------------------------------------------------------ */

export function AffinityInput({
  affinity,
  onChange,
}: {
  affinity: Affinity;
  onChange: (next: Affinity) => void;
}) {
  return (
    <div className="space-y-8">
      <p className="max-w-xl text-sm leading-relaxed text-smoke">
        Reflection, not a test. Nothing here gets scored, and nothing gets
        approved or rejected — you decide whether this world is worth months of
        your attention.
      </p>

      {AFFINITY_QUESTIONS.map((q) => {
        const value = affinity[q.key];
        return (
          <div key={q.key}>
            <p className="text-[15px] leading-snug text-paper/90">
              {q.question}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ ...affinity, [q.key]: n })}
                  className={`display h-11 w-11 text-lg transition ${
                    value === n
                      ? "bg-pink text-black"
                      : "border border-paper/15 text-paper/60 hover:border-pink/60 hover:text-pink"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] uppercase tracking-widest text-smoke/60">
              <span>{q.low}</span>
              <span>{q.high}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* R — VISUAL CALIBRATION                                              */
/* ------------------------------------------------------------------ */

export function VisualCalibrationInput({
  refs,
  onAdd,
  onRemove,
}: {
  refs: VisualReference[];
  onAdd: (files: File[]) => Promise<void>;
  onRemove: (ref: VisualReference) => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    await onAdd(Array.from(files).filter((f) => f.type.startsWith("image/")));
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      <div className="hairline mb-5 bg-pink/5 px-4 py-3 text-sm leading-relaxed text-paper/85">
        Around {SUGGESTED_VISUAL_REFERENCES} existing designs in this world whose
        creative style you love and could imagine designing alongside. Not proof
        of fluency, not demand evidence, and not designs anything will copy —
        they tell the AI what you are picturing when you picture this world.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {refs.map((r) => (
          <div key={r.id} className="rise group relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.src}
              alt=""
              className="h-full w-full border border-paper/15 object-cover"
            />
            <button
              onClick={() => onRemove(r)}
              className="absolute right-1.5 top-1.5 bg-black/80 px-2 py-1 text-[10px] uppercase tracking-widest text-paper/70 opacity-0 transition hover:text-pink group-hover:opacity-100"
            >
              remove
            </button>
          </div>
        ))}

        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center border border-dashed border-pink/40 text-pink transition hover:border-pink hover:bg-pink/5 disabled:opacity-40"
        >
          <span className="display text-3xl">{busy ? "…" : "+"}</span>
          <span className="eyebrow mt-1 text-[9px]">
            {busy ? "Uploading" : "Add images"}
          </span>
        </button>
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => handle(e.target.files)}
        className="hidden"
      />

      <p className="mt-3 text-sm text-smoke">
        {refs.length} reference{refs.length === 1 ? "" : "s"}. Replace or add
        whenever your eye changes.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ACTIVE WORLD AREAS — these power World Daily                        */
/* ------------------------------------------------------------------ */

export function AreasInput({
  areas,
  onAdd,
  onRemove,
}: {
  areas: WorldArea[];
  onAdd: (name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const clean = draft.trim();
    if (!clean || busy) return;
    if (areas.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    setBusy(true);
    setDraft("");
    await onAdd(clean);
    setBusy(false);
  }

  return (
    <div>
      <div className="hairline mb-5 bg-pink/5 px-4 py-3 text-sm leading-relaxed text-paper/85">
        The parts of your customer&apos;s world you want watched every day. You
        pick these, not the AI. A festival shop might watch festival fashion,
        EDM culture, streetwear, nightlife, rave humor, festival beauty. Yours
        will be different.
      </div>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="festival fashion"
          className="hairline w-full bg-black/60 px-4 py-3 text-base text-paper outline-none placeholder:text-smoke/50 focus:border-pink"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || busy}
          className="display shrink-0 bg-pink px-6 text-lg text-black transition hover:bg-pink-hot disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-smoke"
        >
          Add
        </button>
      </div>

      {areas.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span
              key={a.id}
              className="rise flex items-center gap-2 border border-pink/40 px-3 py-1.5 text-sm text-pink"
            >
              {a.name}
              <button
                onClick={() => onRemove(a.id)}
                className="text-smoke/60 transition hover:text-pink"
                aria-label={`Remove ${a.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
