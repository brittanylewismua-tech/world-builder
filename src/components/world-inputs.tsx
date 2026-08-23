"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AFFINITY_QUESTIONS,
  MIN_SUB_NICHES,
  SUGGESTED_VISUAL_REFERENCES,
  type Affinity,
  type SubNiche,
  type VisualReference,
  type WorldArea,
} from "@/lib/world";
import { against, parseKeywords } from "@/lib/keywords";
import { Note } from "./ui";

/* ------------------------------------------------------------------ */
/* W — WORK UP FROM DEMAND                                             */
/* ------------------------------------------------------------------ */

export function SubNicheInput({
  subNiches,
  onAdd,
  onAddMany,
  onRemove,
}: {
  subNiches: SubNiche[];
  onAdd: (keyword: string) => Promise<void>;
  onAddMany: (keywords: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  /** Everything a paste turned up, held for approval before it is saved. */
  const [pending, setPending] = useState<string[] | null>(null);
  const [skipped, setSkipped] = useState({ dropped: 0, duplicates: 0 });
  const remaining = Math.max(0, MIN_SUB_NICHES - subNiches.length);
  const pct = Math.min(100, (subNiches.length / MIN_SUB_NICHES) * 100);

  /** Run text through the parser and either add it or offer it for review. */
  function take(text: string, alwaysReview = false) {
    const { keywords, dropped } = parseKeywords(text);
    const { fresh, duplicates } = against(
      keywords,
      subNiches.map((s) => s.keyword),
    );
    if (!fresh.length) {
      setSkipped({ dropped, duplicates });
      setPending(keywords.length ? [] : null);
      return true;
    }
    // One keyword typed by hand goes straight in; a batch gets looked at.
    if (fresh.length === 1 && !alwaysReview) {
      setDraft("");
      setBusy(true);
      onAdd(fresh[0]).finally(() => setBusy(false));
      return true;
    }
    setSkipped({ dropped, duplicates });
    setPending(fresh);
    setDraft("");
    return true;
  }

  async function commit() {
    if (!pending?.length) return;
    setBusy(true);
    await onAddMany(pending);
    setBusy(false);
    setPending(null);
    setSkipped({ dropped: 0, duplicates: 0 });
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
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !draft.trim() || busy) return;
            e.preventDefault();
            take(draft);
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            // Only intercept a paste that is clearly more than one keyword;
            // pasting a single phrase should behave like typing it.
            if (!/[\n\t,]/.test(text)) return;
            e.preventDefault();
            take(text, true);
          }}
          placeholder="jesus loves you shirt — or paste your whole eRank list"
          className="field"
        />
        <button
          onClick={() => draft.trim() && take(draft)}
          disabled={!draft.trim() || busy}
          className="btn btn-primary"
        >
          Add
        </button>
      </div>

      <p className="t-small mt-2 text-ink-3">
        One at a time, several separated by commas, or paste straight from
        eRank — the numbers get thrown away and only the keywords are kept.
      </p>

      {/* What a paste found, before anything is saved. */}
      {pending && (
        <div className="rise mt-4 rounded-xl border-2 border-black bg-white p-4 shadow-[4px_4px_0_var(--accent)]">
          {pending.length > 0 ? (
            <>
              <p className="t-h3">
                Found {pending.length} keyword{pending.length === 1 ? "" : "s"}
              </p>
              <p className="t-small mt-0.5 text-ink-2">
                Take out anything you don&apos;t want, then add them.
                {skipped.duplicates > 0 &&
                  ` ${skipped.duplicates} you already had ${skipped.duplicates === 1 ? "was" : "were"} left out.`}
              </p>
              <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
                {pending.map((k, i) => (
                  <span key={`${k}-${i}`} className="chip chip-accent">
                    {k}
                    <button
                      onClick={() =>
                        setPending(pending.filter((_, j) => j !== i))
                      }
                      aria-label={`Remove ${k}`}
                      className="text-black/45 transition hover:text-black"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={commit}
                  disabled={busy}
                  className="btn btn-accent"
                >
                  {busy ? "Adding…" : `Add ${pending.length}`}
                </button>
                <button
                  onClick={() => setPending(null)}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="t-h3">Nothing new in that</p>
              <p className="t-small mt-0.5 text-ink-2">
                {skipped.duplicates > 0
                  ? `All ${skipped.duplicates} of those are already in your list.`
                  : "I could not find any keywords in what you pasted — it looked like numbers or column headings. Try pasting the keyword column, or type them in."}
              </p>
              <button
                onClick={() => setPending(null)}
                className="btn btn-ghost mt-3"
              >
                Close
              </button>
            </>
          )}
        </div>
      )}

      {/* progress toward the floor, stated plainly */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f4f2f1]">
          <div
            className="h-full rounded-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="t-small whitespace-nowrap text-ink-2">
          {remaining > 0
            ? `${subNiches.length} of ${MIN_SUB_NICHES}`
            : `${subNiches.length} added`}
        </span>
      </div>
      <p className="t-small mt-1.5 text-ink-3">
        {remaining > 0
          ? `${remaining} more to reach the minimum of ${MIN_SUB_NICHES}.`
          : "Minimum reached. There is no cap — keep adding as you validate."}
      </p>

      {subNiches.length > 0 && (
        <ul className="mt-5 divide-y divide-black/10 overflow-hidden rounded-2xl border border-black/12">
          {subNiches.map((s, i) => (
            <li
              key={s.id}
              className="group flex items-center gap-3 bg-white px-4 py-2.5"
            >
              <span className="t-small w-5 shrink-0 tabular-nums text-ink-3">
                {i + 1}
              </span>
              <span className="t-body flex-1 text-ink">{s.keyword}</span>
              <button
                onClick={() => onRemove(s.id)}
                className="t-small text-ink-3 opacity-0 transition hover:text-ink group-hover:opacity-100"
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

/**
 * One affinity question on its own. Onboarding shows these one card at a
 * time; World Profile stacks all four.
 */
export function AffinityScale({
  question,
  low,
  high,
  value,
  onChange,
  bare = false,
}: {
  question: string;
  low: string;
  high: string;
  value: number | null;
  onChange: (n: number) => void;
  /** Drop the surrounding box when the card already provides one. */
  bare?: boolean;
}) {
  return (
    <div className={bare ? "" : "rounded-2xl border border-black/12 bg-white p-4"}>
      {!bare && <p className="t-h3 text-ink">{question}</p>}
      <div className={`flex gap-1 ${bare ? "" : "mt-3"}`}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`h-11 flex-1 rounded-lg border-2 text-sm font-bold tabular-nums transition ${
              value === n
                ? "border-black bg-black text-white"
                : "border-black/12 bg-white text-ink-2 hover:border-black"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between">
        <span className="t-small text-ink-3">{low}</span>
        <span className="t-small text-ink-3">{high}</span>
      </div>
    </div>
  );
}

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
        {AFFINITY_QUESTIONS.map((q) => (
          <AffinityScale
            key={q.key}
            question={q.question}
            low={q.low}
            high={q.high}
            value={affinity[q.key]}
            onChange={(n) => onChange({ ...affinity, [q.key]: n })}
          />
        ))}
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
              className="h-full w-full rounded-xl border border-black/12 object-cover"
            />
            <button
              onClick={() => onRemove(r)}
              className="absolute inset-x-0 bottom-0 rounded-b-xl bg-black/80 py-1.5 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-black/25 text-ink-3 transition hover:border-accent hover:bg-accent-soft hover:text-ink disabled:opacity-40"
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

      <p className="t-small mt-3 text-ink-3">
        {refs.length} reference{refs.length === 1 ? "" : "s"}. Replace or add
        whenever your eye changes.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ACTIVE WORLD AREAS                                                  */
/* ------------------------------------------------------------------ */

/**
 * Areas, proposed rather than demanded.
 *
 * A seller on day one cannot answer "what should I watch every morning?" —
 * that is the fluency the product is supposed to build, not its entry fee.
 * Their validated keywords already imply the answer, so the AI reads those
 * and offers a starting set. Every one is removable and they can add their
 * own, so the seller still decides; they just are not staring at a blank box.
 */
export function AreasSuggest({
  world,
  onAdd,
  onRemove,
}: {
  world: { name: string; subNiches: SubNiche[]; areas: WorldArea[] };
  onAdd: (name: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [thinking, setThinking] = useState(false);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const asked = useRef(false);

  const suggest = useCallback(async () => {
    setThinking(true);
    setErr("");
    try {
      const r = await fetch("/api/suggest-areas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worldName: world.name,
          subNiches: world.subNiches.map((s) => s.keyword),
          existing: world.areas.map((a) => a.name),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not read your keywords.");
      setSuggestions(j.areas as string[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read your keywords.");
      setSuggestions([]);
    } finally {
      setThinking(false);
    }
    // world.areas is intentionally read fresh at call time, not depended on
  }, [world.name, world.subNiches, world.areas]);

  // Read their keywords once, as soon as they arrive on this card.
  useEffect(() => {
    if (asked.current || world.subNiches.length < 2) return;
    asked.current = true;
    suggest();
  }, [world.subNiches.length, suggest]);

  async function take(name: string) {
    setSuggestions((s) => (s ? s.filter((x) => x !== name) : s));
    await onAdd(name);
  }

  async function addOwn() {
    const clean = draft.trim();
    if (!clean) return;
    if (world.areas.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
      setDraft("");
      return;
    }
    setDraft("");
    await onAdd(clean);
  }

  return (
    <div>
      <Note>
        Read from the keywords you just entered. These are starting points, not
        decisions — take out anything that is not your customer, add anything
        that is. You can change them whenever you like.
      </Note>

      {/* what is actually being watched */}
      {world.areas.length > 0 && (
        <div className="mb-4">
          <p className="eyebrow mb-2 text-ink-3">Watching every day</p>
          <div className="flex flex-wrap gap-2">
            {world.areas.map((a) => (
              <span key={a.id} className="chip chip-accent">
                {a.name}
                <button
                  onClick={() => onRemove(a.id)}
                  className="text-black/45 transition hover:text-black"
                  aria-label={`Stop watching ${a.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {thinking && (
        <p className="pulse-soft t-small text-ink-3">
          Reading your {world.subNiches.length} keywords…
        </p>
      )}

      {!thinking && suggestions && suggestions.length > 0 && (
        <div>
          <p className="eyebrow mb-2 text-ink-3">
            {world.areas.length ? "More you could watch" : "Tap the ones that fit"}
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => take(s)}
                className="chip transition hover:shadow-[2px_2px_0_var(--accent)]"
              >
                <span className="text-ink-3">+</span>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && <p className="t-small mt-2 text-ink-2">{err}</p>}

      <div className="mt-5 border-t border-black/10 pt-4">
        <p className="eyebrow mb-2 text-ink-3">Or add your own</p>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOwn()}
            placeholder="something you know about her"
            className="field"
          />
          <button
            onClick={addOwn}
            disabled={!draft.trim()}
            className="btn btn-primary"
          >
            Add
          </button>
        </div>
        {!thinking && (
          <button
            onClick={suggest}
            className="t-small mt-3 text-ink-3 underline underline-offset-4 transition hover:text-ink"
          >
            Suggest some more
          </button>
        )}
      </div>
    </div>
  );
}

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
                className="text-black/45 transition hover:text-black"
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
