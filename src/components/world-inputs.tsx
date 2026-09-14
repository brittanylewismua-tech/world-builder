"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Zoomable from "@/components/Zoomable";
import {
  MIN_SUB_NICHES,
  SUGGESTED_VISUAL_REFERENCES,
  type SubNiche,
  type VisualReference,
  type WorldArea,
} from "@/lib/world";
import { against, parseKeywords } from "@/lib/keywords";
import { askAI } from "@/lib/askAI";
import { Note } from "./ui";

/* ------------------------------------------------------------------ */
/* W — WORK UP FROM DEMAND                                             */
/* ------------------------------------------------------------------ */

/**
 * A keyword and what the seller knows about it.
 *
 * The note stays folded away, because the list is scanned far more often than
 * it is read. What someone learns about a keyword — who is actually searching
 * it, what it turned out to mean, why it surprised them — is worth more than
 * the keyword on its own, and it evaporates between sessions otherwise.
 */
function SubNicheRow({
  index,
  sub,
  onRemove,
  onNote,
}: {
  index: number;
  sub: SubNiche;
  onRemove: (id: string) => void | Promise<void>;
  onNote?: (id: string, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(sub.note ?? "");

  return (
    <li className="group bg-white px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="t-small w-5 shrink-0 tabular-nums text-ink-3">
          {index + 1}
        </span>
        <span className="t-body flex-1 text-ink">{sub.keyword}</span>
        {onNote && (
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`t-small transition ${
              note.trim()
                ? "font-medium text-ink-2 hover:text-ink"
                : "text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100"
            }`}
          >
            {note.trim() ? "Note" : "Add a note"}
          </button>
        )}
        <button
          onClick={() => onRemove(sub.id)}
          className="t-small text-ink-3 opacity-0 transition hover:text-ink group-hover:opacity-100"
        >
          Remove
        </button>
      </div>

      {open && onNote && (
        <div className="rise pl-8 pt-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (sub.note ?? "") && onNote(sub.id, note)}
            rows={2}
            placeholder="What do you know about this one? Who searches it, what it really means, what surprised you."
            className="field w-full text-[13px]"
          />
        </div>
      )}

      {!open && note.trim() && (
        <p className="t-small truncate pl-8 pt-0.5 text-ink-3">{note}</p>
      )}
    </li>
  );
}

export function SubNicheInput({
  subNiches,
  onAdd,
  onAddMany,
  onRemove,
  onNote,
}: {
  subNiches: SubNiche[];
  onAdd: (keyword: string) => Promise<void>;
  onAddMany: (keywords: string[]) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  /** Absent during onboarding, where a note would be noise. */
  onNote?: (id: string, note: string) => Promise<void>;
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
      /*
        ALWAYS SAY SOMETHING. THIS USED TO SET `null` AND SAY NOTHING AT ALL.

        `null` closes the panel, so when the parser found no keywords the
        seller pressed enter and watched their text sit there, unexplained.
        The one case that produced it was the one that most needed a message:
        the parser had rejected everything they typed. A seller hit that with
        "Etsy Witch", tried it twice more with other phrases, and emailed to
        ask whether the word Etsy was banned.

        An empty array keeps the panel open and lets the copy below explain.
      */
      setPending([]);
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
                  : "Nothing in that read as a keyword — it looked like numbers or column headings. If you typed a real keyword and it landed here, that is a bug on my side, not a rule: send it to Brittany."}
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
            <SubNicheRow
              key={s.id}
              index={i}
              sub={s}
              onRemove={onRemove}
              onNote={onNote}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* O — OWN THE WORLD                                                   */
/* ------------------------------------------------------------------ */



/* ------------------------------------------------------------------ */
/* R — VISUAL CALIBRATION                                              */
/* ------------------------------------------------------------------ */

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
      const j = await askAI<{ areas: string[] }>("/api/suggest-areas", {
        worldName: world.name,
        subNiches: world.subNiches.map((s) => s.keyword),
        existing: world.areas.map((a) => a.name),
      });
      setSuggestions(j.areas);
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
        This is what your World News reads: one search per area every morning,
        and the issue is written out of what comes back. Read from the
        keywords you entered — starting points, not decisions. Take out
        anything that is not your customer, add anything that is.
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

      {/*
        SUGGESTIONS LEAD, TYPING FOLLOWS.

        An empty box was the prominent control and "suggest some more" was a
        small underlined link at the bottom. That is backwards: what makes a
        good area is not obvious, the suggester has been taught what separates
        one from a bad one, and a seller staring at a blank field will write
        the name of her niche rather than the parts of her customer's world.

        The box stays, because she knows things about her customer that no
        model does — it just no longer goes first.
      */}
      <div className="mt-5 border-t border-black/10 pt-4">
        {!thinking && (
          <button onClick={suggest} className="btn btn-primary w-full justify-center">
            Suggest more areas to watch
          </button>
        )}

        <p className="eyebrow mb-2 mt-4 text-ink-3">Or add one yourself</p>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOwn()}
            placeholder="something you know about them"
            className="field"
          />
          <button
            onClick={addOwn}
            disabled={!draft.trim()}
            className="btn btn-ghost"
          >
            Add
          </button>
        </div>
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
        This is what your World News reads. Every morning it runs one search
        per area and writes the issue out of what it finds — so this list is
        tomorrow&apos;s paper. You pick them, not the AI. A festival shop might
        watch festival fashion, EDM culture, streetwear, nightlife, rave humor,
        festival beauty. Yours will be different.
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
