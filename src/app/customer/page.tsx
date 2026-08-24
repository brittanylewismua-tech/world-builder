"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * SHE MOVED IN WITH THE RESEARCH.
 *
 * Talking to the customer was its own destination, which made it a separate
 * errand — you had to decide to go and see her, usually long after the moment
 * you wanted her. She now sits inside the research panel in Drop Studio, a
 * toggle away from the board, because "would she actually buy this?" is a
 * question you have while looking at the board and not before or after.
 *
 * This page stays so old links and bookmarks land somewhere sensible.
 */
export default function CustomerMoved() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/studio?tab=research&talk=customer");
  }, [router]);

  return (
    <p className="t-small p-8 text-ink-3">
      Taking you to the research board, where she lives now…
    </p>
  );
}
