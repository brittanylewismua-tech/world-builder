"use client";

import { useState } from "react";
import Link from "next/link";
import { useWorld } from "@/lib/useWorld";
import Shell from "@/components/Shell";
import { Page, PageHeader, ErrorNote } from "@/components/ui";
import {
  SubNicheInput,
  AffinityInput,
  VisualCalibrationInput,
  AreasSuggest,
} from "@/components/world-inputs";
import { worldActions } from "@/lib/worldActions";
import { AFFINITY_QUESTIONS, hasDemandFloor, type World } from "@/lib/world";
import Customiser from "@/components/Customiser";
import { PRESETS } from "@/lib/theme";

type ModuleKey = "demand" | "connection" | "visual" | "areas" | "look";

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
    <Page width="reading">
      <PageHeader
        eyebrow="World Profile"
        title={world.name}
        lede="Everything here stays editable. Add sub-niches as you validate them, swap references as your eye changes, adjust what gets watched."
        actions={
          <Link href="/setup" className="btn btn-ghost">
            Walk through setup again
          </Link>
        }
      />

      {err && <ErrorNote>{err}</ErrorNote>}

      <div className="mb-6">
        <label className="eyebrow mb-1.5 block text-ink-3">World name</label>
        <input
          value={world.name}
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => a.setName(world.name)}
          className="field max-w-sm"
        />
      </div>

      <div className="space-y-3">
        <Module
          letter="W"
          title="Demand Foundation"
          summary={`${world.subNiches.length} validated sub-niche${world.subNiches.length === 1 ? "" : "s"}`}
          warn={!hasDemandFloor(world) ? "Below the minimum of 6" : undefined}
          open={open === "demand"}
          onToggle={() => toggle("demand")}
        >
          <SubNicheInput
            subNiches={world.subNiches}
            onAdd={a.addSubNiche}
            onAddMany={a.addSubNiches}
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
              <div className="flex -space-x-1.5">
                {world.visualReferences.slice(0, 4).map((r) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={r.id}
                    src={r.src}
                    alt=""
                    className="h-8 w-8 rounded-lg border-2 border-white object-cover"
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
          letter="★"
          title="Make It Yours"
          summary={
            PRESETS.find((p) => p.id === world.theme.preset)?.name ??
            "Custom look"
          }
          open={open === "look"}
          onToggle={() => toggle("look")}
          preview={
            <span
              className="h-6 w-6 rounded-md border-2 border-black"
              style={{ background: world.theme.accent }}
            />
          }
        >
          <Customiser world={world} patch={patch} onError={setErr} />
        </Module>

        <Module
          letter="L"
          title="Active World Areas"
          summary={
            world.areas.length
              ? `${world.areas.length} watched daily`
              : "None yet"
          }
          open={open === "areas"}
          onToggle={() => toggle("areas")}
          preview={
            world.areas.length > 0 && (
              <div className="hidden max-w-[46%] flex-wrap justify-end gap-1 lg:flex">
                {world.areas.slice(0, 3).map((x) => (
                  <span key={x.id} className="chip text-[11px]">
                    {x.name}
                  </span>
                ))}
              </div>
            )
          }
        >
          <AreasSuggest
            world={world}
            onAdd={a.addArea}
            onRemove={a.removeArea}
          />
        </Module>
      </div>
    </Page>
  );
}

function Module({
  letter,
  title,
  summary,
  warn,
  open,
  onToggle,
  children,
  preview,
}: {
  letter: string;
  title: string;
  summary: string;
  warn?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  return (
    <section className={`card overflow-hidden ${open ? "ring-1 ring-accent" : ""}`}>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-[#f4f2f1]"
      >
        <span
          className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm ${
            open ? "bg-black text-white" : "bg-accent"
          }`}
        >
          {letter}
        </span>
        <span className="min-w-0 flex-1 pr-3">
          <span className="t-h3 block whitespace-nowrap text-ink">{title}</span>
          <span className="t-small block text-ink-3">
            {summary}
            {warn && <span className="ml-2 text-ink-2">· {warn}</span>}
          </span>
        </span>
        {!open && preview}
        <span className="shrink-0 text-lg leading-none text-ink-3">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div className="rise border-t border-black/12 p-5 md:p-6">{children}</div>
      )}
    </section>
  );
}
