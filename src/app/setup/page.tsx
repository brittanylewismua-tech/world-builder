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
import { Globe, Sparkle } from "@/components/Globe";

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
    heading: "Name the world.",
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

  // Not signed in -> login. Signed in with a finished world -> straight in.
  useEffect(() => {
    if (loading) return;
    if (!session) router.replace("/login");
    else if (world?.established) router.replace("/daily");
  }, [loading, session, world, router]);

  // Signed in but no world row yet: make one.
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="min-h-dvh gridfield relative overflow-hidden">
      <div className="pointer-events-none absolute -right-56 -top-40 text-pink opacity-60">
        <Globe size={680} />
      </div>

      <div className="relative mx-auto max-w-3xl px-6 py-12 md:py-16">
        <div className="flex items-center gap-2">
          {STEPS.map((x, i) => (
            <button
              key={x.letter}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              className={`display flex h-11 w-11 items-center justify-center text-2xl transition ${
                i === step
                  ? "bg-pink text-black"
                  : i < step
                    ? "border border-pink/50 text-pink hover:bg-pink/10"
                    : "border border-paper/12 text-paper/25"
              }`}
            >
              {x.letter}
            </button>
          ))}
          <span className="ml-2 h-px flex-1 bg-pink/20" />
          <span className="eyebrow text-smoke">
            {step + 1} / {STEPS.length}
          </span>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-2 text-pink">
            <Sparkle size={12} />
            <span className="eyebrow">
              {s.letter} — {s.title}
            </span>
          </div>
          <h1 className="display mt-4 text-[clamp(2rem,5vw,3.4rem)] text-paper">
            {s.heading}
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-smoke">
            {s.line}
          </p>
        </div>

        {err && (
          <p className="mt-6 border-l-2 border-pink bg-pink/10 px-4 py-3 text-sm text-paper">
            {err}
          </p>
        )}

        <div className="mt-10">
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
              <div className="hairline mb-5 bg-pink/5 px-4 py-3 text-sm leading-relaxed text-paper/85">
                Look at your {world.subNiches.length} sub-niches together. What
                is the broader customer universe underneath them? That is the
                world, and you name it — not the AI.
              </div>
              <input
                value={world.name}
                onChange={(e) => patch({ name: e.target.value })}
                onBlur={() => a.setName(world.name)}
                onKeyDown={(e) => e.key === "Enter" && next()}
                placeholder="Festival + Rave"
                className="hairline w-full bg-black/60 px-5 py-4 text-xl text-paper outline-none placeholder:text-smoke/40 focus:border-pink"
              />
              <div className="mt-6 flex flex-wrap gap-2">
                {world.subNiches.map((n) => (
                  <span
                    key={n.id}
                    className="border border-paper/15 px-2.5 py-1 text-xs text-smoke"
                  >
                    {n.keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-12 flex items-center gap-3 border-t border-pink/20 pt-6">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="display border border-paper/25 px-5 py-3 text-lg text-paper transition hover:border-pink hover:text-pink"
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            disabled={!canAdvance || saving}
            className="display flex-1 bg-pink py-4 text-2xl text-black transition hover:bg-pink-hot disabled:cursor-not-allowed disabled:bg-paper/10 disabled:text-smoke"
          >
            {saving
              ? "Building"
              : last
                ? "Build my world"
                : step === 0 && !canAdvance
                  ? `${MIN_SUB_NICHES - world.subNiches.length} more sub-niches`
                  : step === 3 && !canAdvance
                    ? "Add at least one area"
                    : "Continue"}
          </button>
        </div>

        {(step === 1 || step === 2) && (
          <button
            onClick={() => setStep(step + 1)}
            className="eyebrow mt-4 text-smoke transition hover:text-pink"
          >
            Skip for now — you can fill this in later
          </button>
        )}
      </div>
    </main>
  );
}
