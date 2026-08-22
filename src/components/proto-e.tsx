/* eslint-disable @next/next/no-img-element */

/**
 * DIRECTION E — hard contrast.
 *
 * White, black, hot pink. No lavender, no wash, no gradient — pink lands as a
 * punch against black and white rather than soaking the page.
 *
 * Keeps the playful vocabulary from the carousels (window dots, stars, big
 * numerals, bold lowercase with pink italic emphasis, cards that lift) but
 * runs it on a graphic black-and-white chassis so it reads as a tool rather
 * than a toy.
 */

const AREAS = [
  "christian motherhood",
  "worship music culture",
  "bible journaling",
  "modest fashion",
];

const ITEMS = [
  {
    area: "christian motherhood",
    headline: '"5 things i do as a christian mom" is the tiktok format right now',
    body: "Christian mom creators are posting a repeatable listicle-style video under this exact title, stacked with hashtags like #womanofgod and #christianfyp. Alongside it a quieter thread is trending: slow morning routines built around a few minutes in Scripture.",
    sources: ["tiktok.com", "tiktok.com"],
  },
  {
    area: "worship music culture",
    headline: "for KING & COUNTRY back on the road with a new single mid-tour",
    body: "The duo is running a Summer 2026 tour right now, with a confirmed stop at Ohio's Fraze Pavilion. Their current single has been climbing Christian radio and is showing up in the setlist alongside older favorites.",
    sources: ["music.apple.com", "ticketmaster.com"],
  },
  {
    area: "modest fashion",
    headline: "satin dresses and matching sets are the modest wardrobe right now",
    body: "Satin has become the fabric people keep reaching for, from everyday maxi dresses up to occasion gowns. Coordinated sets are everywhere as a no-effort styling shortcut, and the palette is turning sage, terracotta and chocolate.",
    sources: ["kabayarefashion.com", "shimmidresses.com"],
  },
];

/** The window-dot motif, kept — but recoloured onto the palette. */
function Dots({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-[#ee6fc0]" />
      <span
        className={`h-2.5 w-2.5 rounded-full ${onDark ? "bg-white/85" : "bg-black"}`}
      />
      <span
        className={`h-2.5 w-2.5 rounded-full border ${
          onDark ? "border-white/45" : "border-black/30"
        }`}
      />
    </div>
  );
}

function Star({
  size = 16,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d="M12 0l2.9 8.6L24 9.2l-7.2 5.3 2.6 8.9L12 18.2 4.6 23.4l2.6-8.9L0 9.2l9.1-.6z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function DirectionE() {
  return (
    <div className="proto-e flex min-h-[760px] overflow-hidden rounded-2xl border-2 border-black bg-white">
      {/* BLACK RAIL */}
      <aside className="relative hidden w-[236px] shrink-0 flex-col overflow-hidden bg-black p-4 md:flex">
        <img
          src="/globe.png"
          alt=""
          className="pointer-events-none absolute -bottom-16 -left-16 h-[260px] w-[260px] max-w-none opacity-20"
        />
        <Star size={11} className="absolute right-5 top-24 text-white/25" />
        <Star size={8} className="absolute right-10 top-32 text-[#ee6fc0]/60" />

        <div className="relative">
          <Dots onDark />
          <div className="mt-4 flex items-center gap-2">
            <img src="/globe.png" alt="" className="h-7 w-7" />
            <span className="text-[17px] font-extrabold leading-none tracking-tight text-white">
              world builder
            </span>
          </div>

          <nav className="mt-6 space-y-1">
            {[
              "world daily",
              "drop studio",
              "talk to the customer",
              "drop history",
              "world profile",
            ].map((n, i) => (
              <div
                key={n}
                className={`rounded-lg px-3.5 py-2 text-[13.5px] font-semibold transition ${
                  i === 0
                    ? "bg-[#ee6fc0] text-black"
                    : "text-white/45 hover:bg-white/[0.07] hover:text-white"
                }`}
              >
                {n}
              </div>
            ))}
          </nav>
        </div>

        <div className="relative mt-auto">
          <div className="border-t border-white/15 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              your world
            </p>
            <p className="mt-1 text-[19px] font-extrabold tracking-tight text-white">
              quiet faith
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded-md bg-[#ee6fc0] px-2 py-0.5 text-[11px] font-bold text-black">
                day 14
              </span>
              <span className="text-[11.5px] text-white/40">6 niches</span>
            </div>
          </div>
        </div>
      </aside>

      {/* WHITE CANVAS */}
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <img
          src="/globe.png"
          alt=""
          className="pointer-events-none absolute -right-32 -top-28 h-[480px] w-[480px] max-w-none opacity-[0.22]"
        />
        <Star size={14} className="absolute right-[16%] top-[7%] text-[#ee6fc0]" />
        <Star size={9} className="absolute right-[26%] top-[13%] text-black/20" />

        <div className="relative px-7 py-7">
          {/* masthead */}
          <div className="flex items-center justify-between">
            <span className="rounded-md bg-black px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-white">
              world daily
            </span>
            <span className="text-[12.5px] font-medium text-black/45">
              saturday, august 22
            </span>
          </div>

          <h1 className="mt-5 max-w-2xl text-[2.3rem] font-extrabold leading-[1.08] tracking-[-0.028em]">
            good afternoon — here&apos;s what your customer is{" "}
            <span className="italic text-[#ee6fc0]">obsessed with</span> today
          </h1>
          <span className="mt-4 block h-[3px] w-14 bg-[#ee6fc0]" />

          <div className="mt-5 flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <span
                key={a}
                className="rounded-md border-[1.5px] border-black px-2.5 py-1 text-[12px] font-semibold"
              >
                {a}
              </span>
            ))}
          </div>

          {/* items */}
          <div className="mt-7 space-y-4">
            {ITEMS.map((it, i) => (
              <article
                key={i}
                className="proto-e-card rounded-xl border-2 border-black bg-white px-6 py-5"
              >
                <div className="flex items-center justify-between">
                  <Dots />
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-black/45">
                    {it.area}
                  </span>
                </div>
                <div className="mt-4 flex gap-4">
                  <span className="text-[2.5rem] font-extrabold leading-none tracking-tighter text-[#ee6fc0]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.28rem] font-extrabold leading-snug tracking-[-0.02em]">
                      {it.headline}
                    </h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-black/65">
                      {it.body}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {it.sources.map((s) => (
                        <span
                          key={s}
                          className="rounded-md bg-black px-2.5 py-1 text-[11.5px] font-medium text-white"
                        >
                          {s} ↗
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
