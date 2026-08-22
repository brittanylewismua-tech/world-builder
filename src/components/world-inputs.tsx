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
import { Note } from "./ui";

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
  const pct = Math.min(100, (subNiches.length / MIN_SUB_NICHES) * 100);

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
      <Note>
        These should already have been validated by you inside eRank. This tool
        does not check demand or competition — it takes your word for it,
        because your research is the part that has to be real.
      </Note>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="jesus loves you shirt"
          className="field"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || busy}
          className="btn btn-primary"
        >
          Add
        </button>
      </div>

      {/* progress toward the floor, stated plainly */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunk">
          <div
            className="h-full rounded-full bg-pink transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="t-small whitespace-nowrap text-plum-2">
          {remaining > 0
            ? `${subNiches.length} of ${MIN_SUB_NICHES}`
            : `${subNiches.length} added`}
        </span>
      </div>
      <p className="t-small mt-1.5 text-plum-3">
        {remaining > 0
          ? `${remaining} more to reach the minimum of ${MIN_SUB_NICHES}.`
          : "Minimum reached. There is no cap — keep adding as you validate."}
      </p>

      {subNiches.length > 0 && (
        <ul className="mt-5 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {subNiches.map((s, i) => (
            <li
              key={s.id}
              className="group flex items-center gap-3 bg-white px-4 py-2.5"
            >
              <span className="t-small w-5 shrink-0 tabular-nums text-plum-3">
                {i + 1}
              </span>
              <span className="t-body flex-1 text-plum">{s.keyword}</span>
              <button
                onClick={() => onRemove(s.id)}
                className="t-small text-plum-3 opacity-0 transition hover:text-pink-ink group-hover:opacity-100"
              >
                Remove
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
    <div>
      <Note>
        Reflection, not a test. Nothing here gets scored, and nothing gets
        approved or rejected — you decide whether this world is worth months of
        your attention.
      </Note>

      <div className="space-y-6">
        {AFFINITY_QUESTIONS.map((q) => {
          const value = affinity[q.key];
          return (
            <div key={q.key} className="rounded-2xl border border-line bg-white p-4">
              <p className="t-h3 text-plum">{q.question}</p>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    onClick={() => onChange({ ...affinity, [q.key]: n })}
                    className={`h-9 flex-1 rounded-lg text-sm font-semibold tabular-nums transition ${
                      value === n
                        ? "bg-plum text-white"
                        : "bg-white text-plum-2 hover:bg-pink-soft"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between">
                <span className="t-small text-plum-3">{q.low}</span>
                <span className="t-small text-plum-3">{q.high}</span>
              </div>
            </div>
          );
        })}
      </div>
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
      <Note>
        Around {SUGGESTED_VISUAL_REFERENCES} existing designs in this world whose
        creative style you love and could imagine designing alongside. Not proof
        of fluency, not demand evidence, and not designs anything will copy —
        they tell the AI what you are picturing when you picture this world.
      </Note>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {refs.map((r) => (
          <div key={r.id} className="group relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.src}
              alt=""
              className="h-full w-full rounded-xl border border-line object-cover"
            />
            <button
              onClick={() => onRemove(r)}
              className="absolute inset-x-0 bottom-0 rounded-b-xl bg-plum/80 py-1.5 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-plum-3 transition hover:border-pink hover:bg-pink-soft hover:text-pink-ink disabled:opacity-40"
        >
          <span className="text-xl leading-none">{busy ? "…" : "+"}</span>
          <span className="text-[11px] font-medium">
            {busy ? "Uploading" : "Add"}
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

      <p className="t-small mt-3 text-plum-3">
        {refs.length} reference{refs.length === 1 ? "" : "s"}. Replace or add
        whenever your eye changes.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ACTIVE WORLD AREAS                                                  */
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
      <Note>
        The parts of your customer&apos;s world you want watched every day. You
        pick these, not the AI. A festival shop might watch festival fashion,
        EDM culture, streetwear, nightlife, rave humor, festival beauty. Yours
        will be different.
      </Note>

      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="festival fashion"
          className="field"
        />
        <button
          onClick={add}
          disabled={!draft.trim() || busy}
          className="btn btn-primary"
        >
          Add
        </button>
      </div>

      {areas.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {areas.map((a) => (
            <span key={a.id} className="chip chip-accent">
              {a.name}
              <button
                onClick={() => onRemove(a.id)}
                className="text-pink-ink/55 transition hover:text-pink-ink"
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
