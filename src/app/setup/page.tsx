"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { createWorld, deriveAreas } from "@/lib/api";
import { worldActions } from "@/lib/worldActions";
import {
  AFFINITY_QUESTIONS,
  hasDemandFloor,
  MIN_SUB_NICHES,
  type Affinity,
  type World,
} from "@/lib/world";
import {
  SubNicheInput,
  AffinityScale,
  VisualCalibrationInput,
} from "@/components/world-inputs";
import { Loading } from "@/components/Shell";
import { Globe } from "@/components/Globe";
import { ThemeStyle, Wallpaper } from "@/components/Wallpaper";
import { DEFAULT_THEME } from "@/lib/theme";
import { ErrorNote, Note } from "@/components/ui";

/**
 * ONBOARDING — one card, one question.
 *
 * These cards are not a tour of the WORLD framework. That gets taught in the
 * challenge; here we only ask for what the software genuinely cannot work out
 * on its own. Anything derivable from the answers is derived, not asked.
 *
 * Which is why there is no "what should I watch every day?" card. A seller on
 * day one has no way to answer that, and their validated keywords already
 * imply it — so the world sets its own watch list when it is built, and stays
 * adjustable afterwards in World Profile.
 *
 * SPEC: "This is not a one-time onboarding wizard that disappears forever."
 * Every question here is the same question World Profile asks, so nothing
 * answered now is ever locked. The four connection questions are separate
 * cards rather than one long form; a 1–10 scale asked on its own gets a
 * considered answer, and the same four stacked together get four sevens.
 */

interface Step {
  eyebrow: string;
  question: string;
  line: string;
  /** Optional — steps without one cannot be skipped. */
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    eyebrow: "your research",
    question: "Which sub-niches did you validate?",
    line: `Worlds are found from the bottom up. Bring the keywords you already researched in eRank — at least ${MIN_SUB_NICHES} — and the world underneath them will show itself.`,
  },
  {
    eyebrow: "your connection",
    question: AFFINITY_QUESTIONS[0].question,
    line: "Demand on its own is not enough. Fluency comes faster when you like the person you are building for.",
    optional: true,
  },
  {
    eyebrow: "your connection",
    question: AFFINITY_QUESTIONS[1].question,
    line: "Wanting the thing yourself is the shortest route to understanding why someone else would.",
    optional: true,
  },
  {
    eyebrow: "your connection",
    question: AFFINITY_QUESTIONS[2].question,
    line: "This is a long game. Months of curiosity is the actual requirement.",
    optional: true,
  },
  {
    eyebrow: "your connection",
    question: AFFINITY_QUESTIONS[3].question,
    line: "Nothing here is scored, and nothing gets approved or rejected. You decide what your answers mean.",
    optional: true,
  },
  {
    eyebrow: "your eye",
    question: "What are you picturing?",
    line: "Around six existing designs in this world whose style you love. Not designs anything will copy — they show the AI what you see when you imagine this world.",
    optional: true,
  },
  {
    eyebrow: "your world",
    question: "What is this world called?",
    line: "Look at your sub-niches together. What is the broader customer universe underneath them? You name it — not the AI.",
  },
];

export default function Setup() {
  const router = useRouter();
  const { session, world, loading, patch, refresh } = useWorld();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const creating = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
  }, [loading, session, router]);

  useEffect(() => {
    if (loading || !session || world || creating.current) return;
    creating.current = true;
    createWorld()
      .then(() => refresh())
      .catch((e) =>
        setErr(e instanceof Error ? e.message : "Could not start a world."),
      );
  }, [loading, session, world, refresh]);

  if (loading || !session || !world) return <Loading />;

  return (
    <SetupBody
      key={world.id}
      world={world}
      patch={patch}
      step={step}
      setStep={setStep}
      err={err}
      setErr={setErr}
      saving={saving}
      setSaving={setSaving}
      revisit={world.established}
      onDone={() => router.replace(world.established ? "/profile" : "/home")}
    />
  );
}

function SetupBody({
  world,
  patch,
  step,
  setStep,
  err,
  setErr,
  saving,
  setSaving,
  revisit,
  onDone,
}: {
  world: World;
  patch: (p: Partial<World>) => void;
  step: number;
  setStep: (n: number) => void;
  err: string;
  setErr: (s: string) => void;
  saving: boolean;
  setSaving: (b: boolean) => void;
  /** Walking it again on a world that already exists. */
  revisit: boolean;
  onDone: () => void;
}) {
  const a = worldActions(world, patch, setErr);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  const topRef = useRef<HTMLDivElement>(null);

  /** Which affinity key this step edits, if any. */
  const affinityKey: keyof Affinity | null =
    step >= 1 && step <= 4 ? AFFINITY_QUESTIONS[step - 1].key : null;

  const canAdvance = (() => {
    if (step === 0) return hasDemandFloor(world);
    if (step === 6) return world.name.trim().length > 0;
    return true;
  })();

  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  async function next() {
    if (!canAdvance) return;
    if (last) {
      setSaving(true);
      const name = world.name.trim();
      await a.establish(name);
      // Nobody was asked what to watch, so the world works it out from the
      // keywords. Failure here is survivable — World Daily offers to do it.
      if (!revisit && world.areas.length === 0) {
        await deriveAreas(
          world.id,
          name,
          world.subNiches.map((n) => n.keyword),
        );
      }
      setSaving(false);
      onDone();
      return;
    }
    go(step + 1);
  }

  const pct = ((step + 1) / STEPS.length) * 100;

  return (
    <main className="relative min-h-dvh">
      <ThemeStyle theme={world.theme ?? DEFAULT_THEME} />
      <Wallpaper theme={world.theme ?? DEFAULT_THEME} />

      <div className="relative z-10 border-b border-black/12 bg-white/78 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2 px-5 md:px-8">
          <Globe size={22} />
          <span className="text-[1.05rem] font-extrabold tracking-tight">
            world builder
          </span>
          <span className="t-small ml-auto tabular-nums text-ink-3">
            {step + 1} of {STEPS.length}
          </span>
          {revisit && (
            <button
              onClick={onDone}
              className="t-small ml-4 font-semibold underline underline-offset-4 transition hover:opacity-70"
            >
              Done
            </button>
          )}
        </div>
        <div className="h-[3px] w-full bg-black/8">
          <div
            className="h-full bg-accent transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div
        ref={topRef}
        className="relative z-10 mx-auto max-w-2xl px-5 py-10 md:px-8"
      >
        {err && <ErrorNote>{err}</ErrorNote>}

        {/* ONE CARD. ONE QUESTION. */}
        <section key={step} className="card rise p-6 md:p-8">
          <span className="eyebrow text-ink-3">{s.eyebrow}</span>

          <h1 className="t-h1 mt-3 text-ink">{s.question}</h1>
          <p className="t-body mt-2.5 text-ink-2">{s.line}</p>
          <span className="rule-accent mt-5" />

          <div className="mt-6">
            {step === 0 && (
              <SubNicheInput
                subNiches={world.subNiches}
                onAdd={a.addSubNiche}
                onAddMany={a.addSubNiches}
                onRemove={a.removeSubNiche}
              />
            )}

            {affinityKey && (
              <AffinityScale
                bare
                question={s.question}
                low={AFFINITY_QUESTIONS[step - 1].low}
                high={AFFINITY_QUESTIONS[step - 1].high}
                value={world.affinity[affinityKey]}
                onChange={(n) =>
                  a.setAffinity({ ...world.affinity, [affinityKey]: n })
                }
              />
            )}

            {step === 5 && (
              <VisualCalibrationInput
                refs={world.visualReferences}
                onAdd={a.addVisualReferences}
                onRemove={a.removeVisualReference}
              />
            )}

            {step === 6 && (
              <div>
                <input
                  value={world.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  onBlur={() => a.setName(world.name)}
                  onKeyDown={(e) => e.key === "Enter" && next()}
                  placeholder="Festival + Rave"
                  className="field text-lg"
                  autoFocus
                />
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {world.subNiches.map((n) => (
                    <span key={n.id} className="chip">
                      {n.keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-5 flex items-center gap-3">
          {step > 0 && (
            <button onClick={() => go(step - 1)} className="btn btn-ghost">
              Back
            </button>
          )}
          <button
            onClick={next}
            disabled={!canAdvance || saving}
            className="btn btn-accent flex-1 py-3 text-base"
          >
            {saving
              ? revisit
                ? "Saving…"
                : "Opening your world…"
              : last
                ? revisit
                  ? "Save and close"
                  : "Enter my world builder"
                : step === 0 && !canAdvance
                  ? `${MIN_SUB_NICHES - world.subNiches.length} more to go`
                  : "Continue"}
          </button>
        </div>

        {s.optional && !last && (
          <button
            onClick={() => go(step + 1)}
            className="t-small mt-3 text-ink-3 transition hover:text-ink"
          >
            {revisit
              ? "Leave this one as it is"
              : "Skip — you can answer this any time in World Profile"}
          </button>
        )}

        <div className="mt-8">
          <Note>
            {revisit
              ? "Every answer saves as you make it. Close whenever you like — you do not have to reach the end."
              : "Nothing here is locked. Every one of these questions stays open and editable in World Profile for as long as the world exists."}
          </Note>
        </div>
      </div>
    </main>
  );
}
