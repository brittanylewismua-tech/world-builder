/* eslint-disable @next/next/no-img-element */
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadWinners, perDay, type Winner } from "@/lib/winners";

/**
 * ONE KEYWORD'S DESIGNS, ON THEIR OWN PAGE.
 *
 * A tab rather than an overlay, because an overlay lives inside the app and
 * an app has a navigation rail, a wallpaper and a header — all of which end
 * up in the screenshot. This page has none of that. It opens in a new tab,
 * shows the designs and their numbers at a size where the lot fits on one
 * screen, and is otherwise empty.
 *
 * The numbers stay. They were taken out of the first version on the theory
 * that a screenshot should be pure artwork, which was wrong: the point of
 * carrying this into a design chat is that it can see which of the ten did
 * the business, and stripping the figures throws that away.
 *
 * There is no rail here and no world theme. Plain white screenshots cleanly
 * and drops into anything.
 */
export default function ViewPage() {
  return (
    <Suspense fallback={null}>
      <Designs />
    </Suspense>
  );
}

function Designs() {
  const params = useSearchParams();
  const worldId = params.get("world") ?? "";
  const keyword = params.get("keyword") ?? "";

  const [list, setList] = useState<Winner[] | null>(null);

  useEffect(() => {
    if (!worldId) return;
    loadWinners(worldId)
      .then((all) =>
        setList(
          all
            .filter((w) => w.keyword === keyword && w.imageUrl)
            .sort((a, b) => b.sales - a.sales),
        ),
      )
      .catch(() => setList([]));
  }, [worldId, keyword]);

  useEffect(() => {
    document.title = keyword ? `${keyword} — winners` : "Winners";
  }, [keyword]);

  if (!list)
    return (
      <main className="p-10">
        <p className="t-small text-ink-3">Loading…</p>
      </main>
    );

  if (!list.length)
    return (
      <main className="p-10">
        <p className="t-small text-ink-3">
          Nothing to show. Open this from the World Winners page.
        </p>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl bg-white p-6 md:p-10">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-black pb-3">
        <h1 className="t-h1 text-ink">{keyword}</h1>
        <p className="t-small text-ink-3">
          {list.length} designs · what already sold on Etsy
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {list.map((w) => (
          <figure key={w.id}>
            <img
              src={w.imageUrl as string}
              alt={w.design ?? w.title}
              className="aspect-square w-full rounded object-cover"
            />
            <figcaption className="mt-1.5">
              <p className="text-[13px] font-bold leading-tight text-ink">
                {w.sales.toLocaleString()} sales
              </p>
              <p className="text-[12px] leading-tight text-ink-2">
                {perDay(w).toFixed(1)}/day · {w.ageDays} days
              </p>
              {w.hearts > 0 && (
                <p className="text-[12px] leading-tight text-ink-3">
                  {w.hearts.toLocaleString()} saved
                  {w.views
                    ? ` · ${((100 * w.hearts) / w.views).toFixed(0)}% of views`
                    : ""}
                </p>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
