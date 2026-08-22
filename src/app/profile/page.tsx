"use client";

import { useState } from "react";
import { useWorld } from "@/lib/useWorld";
import Shell from "@/components/Shell";
import {
  SubNicheInput,
  AffinityInput,
  VisualCalibrationInput,
  AreasInput,
} from "@/components/world-inputs";
import { worldActions } from "@/lib/worldActions";
import { AFFINITY_QUESTIONS, hasDemandFloor, type World } from "@/lib/world";

type ModuleKey = "demand" | "connection" | "visual" | "areas";

/**
 * SPEC: "Each module can be revisited independently. Do not force the seller to
 *        redo the entire onboarding experience to change one thing."
 */
export default function Profile() {
  return <Shell>{(world) => <ProfileBody world={world} />}</Shell>;
}

function ProfileBody({ world }: { world: World }) {
  const { patch } = useWorld();
  const [open, setOpen] = useState<ModuleKey | null>(null);
  const [err, setErr] = useState("");
  const a = worldActions(world, patch, setErr);

  const toggle = (k: ModuleKey) => setOpen(open === k ? null : k);

  const answered = AFFINITY_QUESTIONS.filter(
    (q) => world.affinity[q.key] !== null,
  ).length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <span className="eyebrow text-pink/70">World Profile</span>
      <input
        value={world.name}
        onChange={(e) => patch({ name: e.target.value })}
        onBlur={() => a.setName(world.name)}
        className="display mt-3 w-full bg-transparent text-[clamp(2rem,5vw,3.2rem)] text-paper outline-none focus:text-pink"
      />
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-smoke">
        Everything here stays editable. Add sub-niches as you validate them,
        swap references as your eye changes, adjust what gets watched.
      </p>

      {err && (
        <p className="mt-6 border-l-2 border-pink bg-pink/10 px-4 py-3 text-sm text-paper">
          {err}
        </p>
      )}

      <div className="mt-10 space-y-3">
        <Module
          letter="W"
          title="Demand Foundation"
          summary={`${world.subNiches.length} validated sub-niche${world.subNiches.length === 1 ? "" : "s"}${hasDemandFloor(world) ? "" : " — below the minimum of 6"}`}
          open={open === "demand"}
          onToggle={() => toggle("demand")}
        >
          <SubNicheInput
            subNiches={world.subNiches}
            onAdd={a.addSubNiche}
            onRemove={a.removeSubNiche}
          />
        </Module>

        <Module
          letter="O"
          title="Personal Connection"
          summary={
            answered === 0
              ? "Not answered yet"
              : `${answered} of ${AFFINITY_QUESTIONS.length} answered`
          }
          open={open === "connection"}
          onToggle={() => toggle("connection")}
        >
          <AffinityInput affinity={world.affinity} onChange={a.setAffinity} />
        </Module>

        <Module
          letter="R"
          title="Visual Direction"
          summary={`${world.visualReferences.length} reference${world.visualReferences.length === 1 ? "" : "s"}`}
          open={open === "visual"}
          onToggle={() => toggle("visual")}
          preview={
            world.visualReferences.length > 0 && (
              <div className="flex -space-x-2">
                {world.visualReferences.slice(0, 5).map((r) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={r.id}
                    src={r.src}
                    alt=""
                    className="h-9 w-9 border border-black object-cover"
                  />
                ))}
              </div>
            )
          }
        >
          <VisualCalibrationInput
            refs={world.visualReferences}
            onAdd={a.addVisualReferences}
            onRemove={a.removeVisualReference}
          />
        </Module>

        <Module
          letter="L"
          title="Active World Areas"
          summary={
            world.areas.length
              ? world.areas.map((x) => x.name).join(" · ")
              : "None yet"
          }
          open={open === "areas"}
          onToggle={() => toggle("areas")}
        >
          <AreasInput
            areas={world.areas}
            onAdd={a.addArea}
            onRemove={a.removeArea}
          />
        </Module>
      </div>
    </main>
  );
}

function Module({
  letter,
  title,
  summary,
  open,
  onToggle,
  children,
  preview,
}: {
  letter: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  return (
    <section
      className={`border transition ${open ? "border-pink/50 bg-white/[0.02]" : "border-paper/12"}`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <span
          className={`display flex h-10 w-10 shrink-0 items-center justify-center text-xl ${
            open ? "bg-pink text-black" : "border border-pink/40 text-pink"
          }`}
        >
          {letter}
        </span>
        <span className="min-w-0 flex-1">
          <span className="display block text-lg text-paper">{title}</span>
          <span className="block truncate text-sm text-smoke">{summary}</span>
        </span>
        {!open && preview}
        <span className="display shrink-0 text-xl text-pink/60">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="rise border-t border-pink/15 px-5 py-6">{children}</div>
      )}
    </section>
  );
}
