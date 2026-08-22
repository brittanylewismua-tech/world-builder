import type { Theme } from "./theme";

// The World Profile — the foundational record established through WORLD.
//
// SPEC: "This is not a one-time onboarding wizard that disappears forever.
//        The user should always be able to revisit and modify it."
//
// Everything here is entered by the seller. Nothing is inferred, scored,
// validated, or judged by the AI. See SPEC.md, "WHAT THE AI MUST NOT DO".

/** W — a sub-niche the seller validated themselves, inside eRank. */
export interface SubNiche {
  id: string;
  keyword: string;
  note: string;
}

/** O — reflection, not assessment. No verdict is ever computed from these. */
export interface Affinity {
  interest: number | null;
  wouldOwn: number | null;
  monthsOfCuriosity: number | null;
  understandsAppeal: number | null;
}

export const EMPTY_AFFINITY: Affinity = {
  interest: null,
  wouldOwn: null,
  monthsOfCuriosity: null,
  understandsAppeal: null,
};

export const AFFINITY_QUESTIONS: {
  key: keyof Affinity;
  question: string;
  low: string;
  high: string;
}[] = [
  {
    key: "interest",
    question: "How much does this world genuinely interest you?",
    low: "Not at all",
    high: "Deeply",
  },
  {
    key: "wouldOwn",
    question:
      "How likely would you be to personally wear, buy, display, or gift something from this world?",
    low: "Never",
    high: "Constantly",
  },
  {
    key: "monthsOfCuriosity",
    question:
      "How interested are you in spending months learning more about this customer?",
    low: "Dreading it",
    high: "Can't wait",
  },
  {
    key: "understandsAppeal",
    question:
      "When you see products in this niche, do you naturally understand why someone would want them?",
    low: "Never get it",
    high: "Instantly",
  },
];

/**
 * R — visual calibration.
 * SPEC: "not proof of fluency... not demand evidence... not products the AI
 *        should copy." Style context only.
 */
export interface VisualReference {
  id: string;
  /** Path inside the private storage bucket. */
  path: string;
  /** Short-lived signed URL for display. */
  src: string;
}

/** Powers World Daily. SPEC: "The AI does not decide what matters." */
export interface WorldArea {
  id: string;
  name: string;
}

export interface World {
  id: string;
  name: string;
  established: boolean;
  affinity: Affinity;
  shopBannerPath: string | null;
  shopBannerSrc: string | null;
  boardBackground: string;
  slotsPerDrop: number;
  dropWeekday: number;
  paused: boolean;
  subNiches: SubNiche[];
  areas: WorldArea[];
  visualReferences: VisualReference[];
  /** How the seller has dressed their portal. */
  theme: Theme;
}

/** SPEC: "Minimum viable world = at least 6 independently validated sub-niche keywords" */
export const MIN_SUB_NICHES = 6;
export const SUGGESTED_VISUAL_REFERENCES = 6;

/** A count of what the seller entered. NOT a judgment about the world. */
export const hasDemandFloor = (w: World) => w.subNiches.length >= MIN_SUB_NICHES;
