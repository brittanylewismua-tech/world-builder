"use client";

import Link from "next/link";
import { Page, Card } from "@/components/ui";
import { MIN_SUB_NICHES, type World } from "@/lib/world";

/**
 * THE ROOM IS OPEN. THE MACHINERY IS NOT.
 *
 * Somebody who skipped onboarding used to be bounced out of every room back
 * to the questionnaire, which is the same wall wearing a different coat: you
 * cannot look at the thing you joined to look at until you have answered
 * everything.
 *
 * So they can walk in. What they cannot do is press anything expensive,
 * because every one of these features reads from the keyword list and there
 * is nothing to read — a shop read with no world to sort against, a paper
 * with nothing to watch, a customer built from no evidence. Those would not
 * fail cleanly; they would produce confident nonsense.
 *
 * The room still shows its own furniture — its heading, its explanation of
 * what it is for. This sits where the working part would be, says exactly
 * what is missing and how many, and links straight to the place that fixes
 * it. One instruction, one link, no scolding.
 */
export function needsSetup(world: World) {
  return world.subNiches.length < MIN_SUB_NICHES;
}

export default function NeedsSetup({
  world,
  what,
}: {
  world: World;
  /** What this particular room would be doing, in a few words. */
  what: string;
}) {
  const have = world.subNiches.length;
  const short = MIN_SUB_NICHES - have;

  return (
    <Card className="p-8 text-center">
      <p className="t-h2 text-ink">Set up your world first</p>
      <p className="t-body mx-auto mt-3 max-w-[46ch] text-ink-2">
        {what} works from your keywords, and{" "}
        {have === 0 ? (
          <>you have not added any yet.</>
        ) : (
          <>
            you have {have} — {short} short of the {MIN_SUB_NICHES} it needs.
          </>
        )}
      </p>
      <Link href="/setup" className="btn btn-accent mt-6 inline-flex">
        {have === 0 ? "Set up my world" : "Add the rest"}
      </Link>
    </Card>
  );
}

/** The same, as a whole page, for rooms that render nothing else useful. */
export function NeedsSetupPage({
  world,
  what,
  width = "wide",
}: {
  world: World;
  what: string;
  width?: "wide" | "full" | "reading";
}) {
  return (
    <Page width={width}>
      <NeedsSetup world={world} what={what} />
    </Page>
  );
}
