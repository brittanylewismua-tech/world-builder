"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { createWorld } from "@/lib/api";
import { worldActions } from "@/lib/worldActions";
import { hasDemandFloor, MIN_SUB_NICHES, type World } from "@/lib/world";
import {
  SubNicheInput,
  AffinityInput,
  VisualCalibrationInput,
  AreasInput,
} from "@/components/world-inputs";
import { Loading } from "@/components/Shell";
import { Globe } from "@/components/Globe";
import { ErrorNote, Note } from "@/components/ui";

const STEPS = [
  {
    letter: "W",
    title: "Work up from demand",
    heading: "What are you already finding?",
    line: "Worlds are discovered from the bottom up. Bring the sub-niches you already validated, and the world will show itself in what they have in common.",
  },
  {
    letter: "O",
    title: "Own the world",
    heading: "Do you actually like this customer?",
    line: "Demand is not enough. Fluency comes faster when you like the person you are building for.",
  },
  {
    letter: "R",
    title: "Research until you speak it",
    heading: "What are you picturing?",
    line: "Show the AI the creative language you respond to when you imagine this world.",
  },
  {
    letter: "L",
    title: "Layer the world",
    heading: "What should I watch every day?",
    line: "Name the parts of her world you want watched. You can keep adding layers forever — nothing here is locked.",
  },
  {
    letter: "D",
    title: "Drop. Data. Deepen.",
    heading: "Name the world",
    line: "Then your first drop board gets built.",
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
    else if (world?.established) router.replace("/daily");
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
      onDone={() => router.replace("/daily")}
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

  const canAdvance = (() => {
    if (step === 0) return hasDemandFloor(world);
    if (step === 3) return world.areas.length > 0;
    if (step === 4) return world.name.trim().length > 0;
    return true;
  })();

  async function next() {
    if (!canAdvance) return;
    if (last) {
      setSaving(true);
      await a.establish(world.name.trim());
      setSaving(false);
      onDone();
      return;
    }
    setStep(step + 1);
    // Scroll after the new step paints, not before.
    requestAnimationFrame(() =>
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <main className="min-h-dvh bg-transparent">
      {/* slim brand bar so setup still feels like the product */}
      <div className="border-b border-line bg-white backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-5 md:px-8">
          <Globe size={22} />
          <span className="display text-[1.05rem] text-plum">World Builder</span>
          <span className="t-small ml-auto text-plum-3">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
      </div>

      <div ref={topRef} className="mx-auto max-w-3xl px-5 py-8 md:px-8">
        {/* WORLD rail */}
        <ol className="mb-8 flex items-center gap-2">
          {STEPS.map((x, i) => {
            const done = i < step;
            const now = i === step;
            return (
              <li key={x.letter} className="flex flex-1 items-center gap-2">
                <button
                  onClick={() => done && setStep(i)}
                  disabled={!done}
                  title={x.title}
                  className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm transition ${
                    now
                      ? "bg-plum text-white"
                      : done
                        ? "bg-pink text-plum hover:opacity-85"
                        : "bg-white text-plum-3"
                  }`}
                >
                  {x.letter}
                </button>
                {i < STEPS.length - 1 && (
                  <span
                    className={`h-px flex-1 ${done ? "bg-pink" : "bg-line"}`}
                  />
                )}
              </li>
            );
          })}
        </ol>

        <div className="mb-6">
          <span className="eyebrow text-pink-ink">
            {s.letter} — {s.title}
          </span>
          <h1 className="t-h1 mt-2 text-plum">{s.heading}</h1>
          <p className="t-body mt-2 max-w-xl text-plum-2">{s.line}</p>
        </div>

        {err && <ErrorNote>{err}</ErrorNote>}

        <div className="card p-5 md:p-6">
          {step === 0 && (
            <SubNicheInput
              subNiches={world.subNiches}
              onAdd={a.addSubNiche}
              onRemove={a.removeSubNiche}
            />
          )}
          {step === 1 && (
            <AffinityInput affinity={world.affinity} onChange={a.setAffinity} />
          )}
          {step === 2 && (
            <VisualCalibrationInput
              refs={world.visualReferences}
              onAdd={a.addVisualReferences}
              onRemove={a.removeVisualReference}
            />
          )}
          {step === 3 && (
            <AreasInput
              areas={world.areas}
              onAdd={a.addArea}
              onRemove={a.removeArea}
            />
          )}
          {step === 4 && (
            <div>
              <Note>
                Look at your {world.subNiches.length} sub-niches together. What
                is the broader customer universe underneath them? That is the
                world, and you name it — not the AI.
              </Note>
              <input
                value={world.name}
                onChange={(e) => patch({ name: e.target.value })}
                onBlur={() => a.setName(world.name)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="Festival + Rave"
                className="field text-lg"
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

        <div className="mt-5 flex items-center gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="btn btn-ghost">
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
                  ? `${MIN_SUB_NICHES - world.subNiches.length} more sub-niches needed`
                  : step === 3 && !canAdvance
                    ? "Add at least one area"
                    : "Continue"}
          </button>
        </div>

        {(step === 1 || step === 2) && (
          <button
            onClick={() => setStep(step + 1)}
            className="t-small mt-3 text-plum-3 transition hover:text-plum"
          >
            Skip for now — you can fill this in later
          </button>
        )}
      </div>
    </main>
  );
}
