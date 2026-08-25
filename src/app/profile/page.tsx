"use client";

import { useEffect, useState } from "react";
import WorldSwitch from "@/components/WorldSwitch";
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
import DropRhythm from "@/components/DropRhythm";
import PinterestBoards from "@/components/PinterestBoards";
import AccountCard from "@/components/AccountCard";
import OwnYourWorld from "@/components/OwnYourWorld";
import { PRESETS } from "@/lib/theme";

/** For the collapsed summary line only. */
const DAY_NAME: Record<number, string> = {
  1: "Mondays",
  2: "Tuesdays",
  3: "Wednesdays",
  4: "Thursdays",
  5: "Fridays",
  6: "Saturdays",
  7: "Sundays",
};

const MODULE_KEYS = [
  "demand",
  "connection",
  "visual",
  "areas",
  "pinterest",
  "rhythm",
  "look",
] as const;

type ModuleKey = (typeof MODULE_KEYS)[number];

/**
 * The foundation of the world, in one editable place.
 *
 * The letter badges are gone. They implied a mapping to the WORLD method that
 * was never complete — there was no D, and Appearance sat outside the
 * sequence entirely — so the page looked like it was trying to represent the
 * framework and failing. The method is taught in the challenge; this page
 * just holds what the software actually needs.
 *
 * Account settings sit at the bottom. This page is the creative foundation of
 * a world, and opening it with a password field made it read as preferences.
 */
export default function Profile() {
  return <Shell>{(world) => <ProfileBody world={world} />}</Shell>;
}

function ProfileBody({ world }: { world: World }) {
  const { patch } = useWorld();
  const [open, setOpen] = useState<ModuleKey | null>(null);

  /*
    ARRIVE WITH THE RIGHT PANEL ALREADY OPEN.

    Sending somebody here from another page to do one specific thing and then
    landing them on seven identical closed rows is not a link, it is a riddle.
    A hash on the URL — /profile#pinterest — opens that module and scrolls it
    into view, so the link finishes the errand it started.
  */
  useEffect(() => {
    const key = window.location.hash.replace("#", "") as ModuleKey;
    if (!MODULE_KEYS.includes(key)) return;
    setOpen(key);

    /*
      Scrolling once is not enough, and the first version proved it: the panel
      opened but the page stayed at the top.

      Three things move the page after this effect runs — the world finishes
      loading, the panel expands, and the panel's own content arrives over the
      network. A single requestAnimationFrame scrolls to an offset that is
      stale by the time any of that lands.

      So: try a few times over the first second and stop as soon as the module
      is actually near the top of the viewport. Cheap, and it survives content
      that settles at an unpredictable moment.
    */
    /*
      Three things fight this scroll and they all win against a single try:
      the world finishing loading, the panel expanding, and Next's own scroll
      restoration, which runs after hydration and puts the page back at the
      top well after any one-shot attempt.

      So: instant rather than smooth, because a smooth scroll is an animation
      and the next thing to touch scrollTop cancels it halfway. Repeated out
      past the point where the framework has stopped interfering. And it stops
      the moment the module is where it should be, so the common case costs
      one attempt.
    */
    let done = false;
    const timers = [0, 100, 250, 500, 900, 1400, 2000, 2500].map((ms) =>
      setTimeout(() => {
        if (done) return;
        const el = document.getElementById(key);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top >= 0 && top < 100) {
          done = true;
          return;
        }
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }, ms),
    );
    return () => {
      done = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const [err, setErr] = useState("");
  const a = worldActions(world, patch, setErr);

  const toggle = (k: ModuleKey) => setOpen(open === k ? null : k);
  const answered = AFFINITY_QUESTIONS.filter(
    (q) => world.affinity[q.key] !== null,
  ).length;

  return (
    <Page width="reading">
      {/*
        An unnamed world left this page with no heading at all — an eyebrow, a
        rule, and then straight into the modules. A page has to say what it is
        even before the seller has decided what their world is called.
      */}
      <PageHeader
        eyebrow="World Profile"
        title={world.name.trim() || "Your world"}
        lede="Everything here stays editable. Add sub-niches as you validate them, swap references as your eye changes, adjust what gets watched."
        actions={
          <Link href="/setup" className="btn btn-ghost">
            Walk through setup again
          </Link>
        }
      />

      {err && <ErrorNote>{err}</ErrorNote>}

      <WorldSwitch current={world.id} />

      {/*
        One quiet field, never a prompt.

        This used to be a card that appeared on Home and again here, asking to
        be named until it got its way. A name is a convenience — it lets a few
        screens address the world directly — not a thing the software needs.
        Nagging for it made a nicety feel like an unfinished task.
      */}
      <div className="mb-6">
        <label className="eyebrow mb-1.5 block text-ink-3">World name</label>
        <input
          value={world.name}
          onChange={(e) => patch({ name: e.target.value })}
          onBlur={() => a.setName(world.name)}
          placeholder="Optional"
          className="field max-w-sm"
        />
      </div>

      <div className="space-y-3">
        <Module
          title="Demand Foundation"
          summary={`${world.subNiches.length} validated sub-niche${world.subNiches.length === 1 ? "" : "s"}`}
          warn={!hasDemandFloor(world) ? "Below the minimum of 6" : undefined}
          id="demand"
          open={open === "demand"}
          onToggle={() => toggle("demand")}
        >
          <SubNicheInput
            subNiches={world.subNiches}
            onAdd={a.addSubNiche}
            onAddMany={a.addSubNiches}
            onRemove={a.removeSubNiche}
            onNote={a.setSubNicheNote}
          />
        </Module>

        <Module
          title="Personal Connection"
          summary={
            answered === 0
              ? "Not answered yet"
              : `${answered} of ${AFFINITY_QUESTIONS.length} answered`
          }
          id="connection"
          open={open === "connection"}
          onToggle={() => toggle("connection")}
        >
          <AffinityInput affinity={world.affinity} onChange={a.setAffinity} />
        </Module>

        <Module
          title="Visual Calibration"
          summary={`${world.visualReferences.length} reference${world.visualReferences.length === 1 ? "" : "s"}`}
          id="visual"
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
            onReorder={a.reorderVisualReferences}
          />
        </Module>

        <Module
          title="Active World Areas"
          summary={
            world.areas.length
              ? `${world.areas.length} watched daily`
              : "None yet"
          }
          id="areas"
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
        <Module
          title="Pinterest"
          summary="Bring your boards into this world"
          id="pinterest"
          open={open === "pinterest"}
          onToggle={() => toggle("pinterest")}
        >
          <PinterestBoards world={world} />
        </Module>

        <Module
          title="Drop Rhythm"
          summary={`${world.slotsPerDrop} designs, ${DAY_NAME[world.dropWeekday] ?? "weekly"}${world.paused ? " · paused" : ""}`}
          id="rhythm"
          open={open === "rhythm"}
          onToggle={() => toggle("rhythm")}
        >
          <DropRhythm world={world} patch={patch} onError={setErr} />
        </Module>

        <Module
          title="Appearance"
          summary={
            PRESETS.find((p) => p.id === world.theme.preset)?.name ??
            "Custom look"
          }
          id="look"
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

      </div>

      <div className="mt-10 space-y-4 border-t-2 border-black/10 pt-6">
        <AccountCard />
        <OwnYourWorld world={world} />
      </div>
    </Page>
  );
}

function Module({
  id,
  title,
  summary,
  warn,
  open,
  onToggle,
  children,
  preview,
}: {
  /** Anchor target, so /profile#pinterest can land on this one. */
  id?: string;
  title: string;
  summary: string;
  warn?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  preview?: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={`card overflow-hidden scroll-mt-6 ${open ? "ring-1 ring-accent" : ""}`}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3.5 px-5 py-4 text-left transition hover:bg-[#f4f2f1]"
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            open ? "bg-black" : "bg-accent"
          }`}
        />
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
