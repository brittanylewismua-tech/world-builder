/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

/**
 * WHAT THE SHOPS YOU WATCH DID THIS WEEK.
 *
 * The rest of World News is research about a subject. This is the only part
 * of the page that could not be written about anybody else: it is a
 * subtraction between two weeks of readings from the specific shops this
 * seller chose to follow. No model runs. It costs nothing.
 *
 * IT EXPLAINS ITSELF WHEN IT IS EMPTY, which is most of the reason it is
 * here. A section that simply does not appear until it has something to say
 * teaches nobody that the feature exists — and the thing it needs from the
 * seller (follow some competitors) is exactly the thing that makes the rest
 * of the product worth having.
 */

const WANT_SHOPS = 3;

type Design = {
  title: string;
  url: string | null;
  image_url: string | null;
  shop_name: string;
  gained?: number;
  favorers?: number | null;
};

type News = {
  shops: number;
  weeks: number;
  since: string | null;
  new: Design[];
  climbing: Design[];
};

export default function ShopNews({ worldId }: { worldId: string }) {
  const [news, setNews] = useState<News | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(supabase.rpc("wb_shop_news", { w: worldId })).then(
      ({ data }) => {
        if (alive) setNews((data as News | null) ?? null);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [worldId]);

  if (!news) return null;

  const hasNews = news.climbing.length > 0 || news.new.length > 0;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-h2 text-ink">
          in the shops{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            you watch
          </span>
        </h2>
        <Link
          href="/shops"
          className="t-small shrink-0 text-ink-3 underline underline-offset-4 transition hover:text-ink"
        >
          world shops
        </Link>
      </div>

      {/*
        SAY WHAT WILL BE HERE. NOT HOW IT WORKS.

        This used to explain snapshots, comparisons and where to press
        refresh — the machinery, in a place where the reader only wants to
        know whether there is anything to read.
      */}
      {news.shops === 0 && (
        <p className="t-body mt-3 max-w-[58ch] text-ink-2">
          Add at least {WANT_SHOPS} competitor shops in{" "}
          <Link href="/shops" className="underline underline-offset-4">
            World Shops
          </Link>
          , then come back here. Their news arrives with your next issue —
          what they publish, and which of their designs are gaining.
        </p>
      )}

      {news.shops > 0 && news.shops < WANT_SHOPS && (
        <p className="t-body mt-3 max-w-[58ch] text-ink-2">
          Following {news.shops} shop{news.shops === 1 ? "" : "s"}. Add{" "}
          {WANT_SHOPS - news.shops} more and this becomes a read on your
          market rather than on one seller.
        </p>
      )}

      {news.shops >= WANT_SHOPS && !hasNews && (
        <p className="t-body mt-3 max-w-[58ch] text-ink-2">
          Watching {news.shops} shops. Their news arrives with your next
          issue.
        </p>
      )}

      {news.climbing.length > 0 && (
        <>
          <p className="eyebrow mt-5 text-ink-3">Gaining favourites</p>
          <ul className="mt-3 space-y-3">
            {news.climbing.map((d, i) => (
              <Row key={`c${i}`} d={d} note={`+${d.gained} favourites`} />
            ))}
          </ul>
        </>
      )}

      {news.new.length > 0 && (
        <>
          <p className="eyebrow mt-6 text-ink-3">Newly published</p>
          <ul className="mt-3 space-y-3">
            {news.new.map((d, i) => (
              <Row
                key={`n${i}`}
                d={d}
                note={d.favorers ? `${d.favorers} favourites` : "just listed"}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Row({ d, note }: { d: Design; note: string }) {
  const body = (
    <>
      {d.image_url && (
        <img
          src={d.image_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded border-2 border-black object-cover"
        />
      )}
      <span className="min-w-0 flex-1">
        {/* Etsy titles are enormous; two lines is the most any of them earn. */}
        <span className="t-small line-clamp-2 text-ink">{d.title}</span>
        <span className="t-small block text-ink-3">
          {d.shop_name} · {note}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {d.url ? (
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 transition hover:opacity-70"
        >
          {body}
        </a>
      ) : (
        <span className="flex items-center gap-3">{body}</span>
      )}
    </li>
  );
}
