"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { createWorld } from "@/lib/api";
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
  AreasInput,
} from "@/components/world-inputs";
import { Loading } from "@/components/Shell";
import { Globe } from "@/components/Globe";
import { ThemeStyle, Wallpaper } from "@/components/Wallpaper";
import { DEFAULT_THEME } from "@/lib/theme";
import { ErrorNote, Note } from "@/components/ui";

/**
 * ONBOARDING — one card, one question.
 *
 * SPEC: "This is not a one-time onboarding wizard that disappears forever."
 * Every question here is the same question World Profile asks, so nothing
 * answered now is ever locked. The four affinity questions are separate cards
 * rather than one long form; a 1–10 scale asked on its own gets a considered
 * answer, and the same four stacked together get four identical sevens.
 */

interface Step {
  letter: string;
  phase: string;
  question: string;
  line: string;
  /** Optional — steps without one cannot be skipped. */
  optional?: boolean;
}

const STEPS: Step[] = [
  {
    letter: "W",
    phase: "Work up from demand",
    question: "Which sub-niches did you validate?",
    line: `Worlds are found from the bottom up. Bring the keywords you already researched in eRank — at least ${MIN_SUB_NICHES} — and the world underneath them will show itself.`,
  },
  {
    letter: "O",
    phase: "Own the world",
    question: AFFINITY_QUESTIONS[0].question,
    line: "Demand on its own is not enough. Fluency comes faster when you like the person you are building for.",
    optional: true,
  },
  {
    letter: "O",
    phase: "Own the world",
    question: AFFINITY_QUESTIONS[1].question,
    line: "Wanting the thing yourself is the shortest route to understanding why someone else would.",
    optional: true,
  },
  {
    letter: "O",
    phase: "Own the world",
    question: AFFINITY_QUESTIONS[2].question,
    line: "This is a long game. Months of curiosity is the actual requirement.",
    optional: true,
  },
  {
    letter: "O",
    phase: "Own the world",
    question: AFFINITY_QUESTIONS[3].question,
    line: "Nothing here is scored, and nothing gets approved or rejected. You decide what your answers mean.",
    optional: true,
  },
  {
    letter: "R",
    phase: "Research until you speak it",
    question: "What are you picturing?",
    line: "Around six existing designs in this world whose style you love. Not designs anything will copy — they show the AI what you see when you imagine this world.",
    optional: true,
  },
  {
    letter: "L",
    phase: "Layer the world",
    question: "What should I watch every day?",
    line: "Name the parts of her world you want read every morning. You choose these, not the AI, and you can keep adding forever.",
  },
  {
    letter: "D",
    phase: "Drop. Data. Deepen.",
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
    else if (world?.established) router.replace("/home");
  }, [loading, session, world, router]);

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
      world={world}
      patch={patch}
      step={step}
      setStep={setStep}
      err={err}
      setErr={setErr}
      saving={saving}
      setSaving={setSaving}
      onDone={() => router.replace("/home")}
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
    if (step === 6) return world.areas.length > 0;
    if (step === 7) return world.name.trim().length > 0;
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
      await a.establish(world.name.trim());
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
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-[13px] font-extrabold text-white">
              {s.letter}
            </span>
            <span className="eyebrow text-ink-3">{s.phase}</span>
          </div>

          <h1 className="t-h1 mt-4 text-ink">{s.question}</h1>
          <p className="t-body mt-2.5 text-ink-2">{s.line}</p>
          <span className="rule-accent mt-5" />

          <div className="mt-6">
            {step === 0 && (
              <SubNicheInput
                subNiches={world.subNiches}
                onAdd={a.addSubNiche}
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
              <AreasInput
                areas={world.areas}
                onAdd={a.addArea}
                onRemove={a.removeArea}
              />
            )}

            {step === 7 && (
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
              ? "Building your world…"
              : last
                ? "Build my world"
                : step === 0 && !canAdvance
                  ? `${MIN_SUB_NICHES - world.subNiches.length} more to go`
                  : step === 6 && !canAdvance
                    ? "Add at least one area"
                    : "Continue"}
          </button>
        </div>

        {s.optional && (
          <button
            onClick={() => go(step + 1)}
            className="t-small mt-3 text-ink-3 transition hover:text-ink"
          >
            Skip — you can answer this any time in World Profile
          </button>
        )}

        <div className="mt-8">
          <Note>
            Nothing here is locked. Every one of these questions stays open and
            editable in World Profile for as long as the world exists.
          </Note>
        </div>
      </div>
    </main>
  );
}
