"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorld } from "@/lib/useWorld";
import { createWorld, deriveAreas } from "@/lib/api";
import { startFirstIssue } from "@/lib/daily";
import { worldActions } from "@/lib/worldActions";
import {
  hasDemandFloor,
  MIN_SUB_NICHES,
  type World,
} from "@/lib/world";
import {
  SubNicheInput,
} from "@/components/world-inputs";
import { Loading } from "@/components/Shell";
import Logo from "@/components/Logo";
import { ThemeStyle, Wallpaper } from "@/components/Wallpaper";
import { DEFAULT_THEME } from "@/lib/theme";
import { report } from "@/lib/report";
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
 * answered now is ever locked.
 *
 * It asks only what the software goes on to use. Four questions about how
 * much the seller personally related to the world used to live here, on two
 * cards, and nothing anywhere read the answers — they were two screens
 * between somebody and the tool they had just paid for.
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
    /*
      Naming is a nicety, not a requirement. It lets a few screens address
      the world directly and nothing more, so it must never be the thing
      standing between a seller and the tool they just paid for. Optional,
      skippable, and editable forever in World Profile.
    */
    eyebrow: "your world",
    question: "Want to name this world?",
    line: "Some people like calling it something. If a name comes to you looking at your sub-niches, use it — otherwise skip and carry on.",
    optional: true,
  },
];

/*
  Two cards asking how much the seller personally relates to this world used
  to sit between the keywords and these. They were a nice idea and did
  nothing — nothing read the answers, nothing changed because of them, and
  they were two screens standing between somebody and the tool they had just
  paid for. Setup now asks only what the software actually uses.
*/
/*
  "What are you picturing?" went the same way, and for the same reason.

  It asked for a handful of designs whose style the seller loves, and told
  them the pictures would show the AI what they see when they imagine this
  world. They never did. The only thing that ever reached a model was one
  line saying how many had been uploaded — not the images, not a description
  of them, a count. The promise in the question was not one the code kept.

  Uploading references still exists in World Profile, and Pinterest can still
  send a board there, for anybody who wants them on file. What is gone is
  asking every new seller for eight pictures on the way in and implying the
  software will look at them.
*/
const NAME_STEP = 1;

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
      .catch((e) => {
        // The very first thing that can fail for a new seller.
        report("setup", e, { step: "create-world" });
        setErr(e instanceof Error ? e.message : "Could not start a world.");
      });
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

  const canAdvance = (() => {
    if (step === 0) return hasDemandFloor(world);
    // Never gate the last step on a name.
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
      /*
        The paper starts writing now rather than at the next scheduled hour,
        so the first thing this seller reads is an issue and not an apology.
        Not awaited — it runs on while they carry on into the app.
      */
      startFirstIssue(world.id);
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
          <Logo height={20} />
          <span className="t-small ml-auto tabular-nums text-ink-3">
            {step + 1} of {STEPS.length}
          </span>
          {revisit ? (
            <button
              onClick={onDone}
              className="t-small ml-4 font-semibold underline underline-offset-4 transition hover:opacity-70"
            >
              Save and exit
            </button>
          ) : (
            /*
              A WAY OUT OF ONBOARDING THAT IS NOT FINISHING IT.

              Somebody who joined to look around should not be held at a
              questionnaire, and the only exits were answering every question
              or closing the tab. The second one is the one people take, and
              they do not come back.

              It leaves rather than advancing: skipping to the next question is
              not skipping. Everything answered so far is already saved, and
              Home carries a way back in.
            */
            <a
              href="/home"
              className="t-small ml-4 text-ink-3 underline underline-offset-4 transition hover:text-ink"
            >
              Skip for now
            </a>
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

            {step === NAME_STEP && (
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
                  ? "Save and exit"
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
            Skip — you can answer this any time in World Profile
          </button>
        )}
        {last && !world.name.trim() && (
          <p className="t-small mt-3 text-ink-3">
            Leave it blank if nothing fits. You can name it later, or never.
          </p>
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
