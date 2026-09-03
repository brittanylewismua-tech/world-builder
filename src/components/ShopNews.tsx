/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { MOST_SHOPS } from "@/lib/limits";

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
    <section className="mt-12 border-t-2 border-black pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="t-h2 text-ink">
          in the shops{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            you watch
          </span>
        </h2>
        {news.shops > 0 && (
          <Link
            href="/shops"
            className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink"
          >
            world shops
          </Link>
        )}
      </div>

      {/* Nothing followed yet: say what to do and what will happen. */}
      {news.shops === 0 && (
        <p className="t-body mt-3 max-w-[62ch] text-ink-2">
          Follow at least {WANT_SHOPS} competitor shops in{" "}
          <Link href="/shops" className="underline underline-offset-4">
            World Shops
          </Link>
          , and news about them appears here — which of their designs are
          gaining, and what they have published since you last looked. It comes
          from their real Etsy numbers, so it is about your corner of the
          market rather than the internet in general.
        </p>
      )}

      {/* Following some, but not enough to be worth much. */}
      {news.shops > 0 && news.shops < WANT_SHOPS && (
        <p className="t-body mt-3 max-w-[62ch] text-ink-2">
          You are following {news.shops} shop{news.shops === 1 ? "" : "s"}.
          Follow {WANT_SHOPS - news.shops} more — you can hold {MOST_SHOPS} —
          and this becomes a read on your market rather than on one seller.
        </p>
      )}

      {/*
        Following shops, but only one reading on file. The comparison needs
        two, so say plainly when it starts instead of showing an empty space.
      */}
      {news.shops >= WANT_SHOPS && !hasNews && (
        <p className="t-body mt-3 max-w-[62ch] text-ink-2">
          Watching {news.shops} shops. This needs two readings to compare, so
          the first report lands after your next refresh in World Shops — after
          that it says what moved since the last one.
        </p>
      )}

      {news.climbing.length > 0 && (
        <>
          <p className="t-small mt-5 text-ink-3">
            Gaining favourites{news.since ? " since your last reading" : ""}
          </p>
          <ul className="mt-3 space-y-3">
            {news.climbing.map((d, i) => (
              <Row key={`c${i}`} d={d} note={`+${d.gained} favourites`} />
            ))}
          </ul>
        </>
      )}

      {news.new.length > 0 && (
        <>
          <p className="t-small mt-6 text-ink-3">Newly published</p>
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
