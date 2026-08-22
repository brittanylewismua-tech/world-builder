/* eslint-disable @next/next/no-img-element */

import DirectionD from "@/components/proto-d";

/**
 * Visual directions, side by side.
 *
 * A public, static comparison page. Same screen (World Daily), same real
 * content, three genuinely different treatments — so the choice is about look,
 * not about which one has better copy. Nothing here touches the live app.
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
    headline: '"5 Things I Do as a Christian Mom" is the TikTok format right now',
    body: "Christian mom creators are posting a repeatable listicle-style video under this exact title, stacked with hashtags like #womanofgod and #christianfyp. Alongside it a quieter thread is trending: slow morning routines built around a few minutes in Scripture before the day starts.",
    sources: ["tiktok.com", "tiktok.com"],
  },
  {
    area: "worship music culture",
    headline: "for KING & COUNTRY back on the road with a new single mid-tour",
    body: "The duo is running a Summer 2026 tour right now, with a confirmed stop at Ohio's Fraze Pavilion. Their current single has been climbing Christian radio since release and is showing up in the setlist alongside older favorites.",
    sources: ["music.apple.com", "ticketmaster.com"],
  },
  {
    area: "modest fashion",
    headline: "Satin dresses and matching two-piece sets are the modest wardrobe right now",
    body: "Satin has become the fabric people keep reaching for, from everyday maxi dresses up to occasion gowns. Coordinated sets are everywhere as a no-effort styling shortcut, and the palette is turning toward sage, terracotta and chocolate brown.",
    sources: ["kabayarefashion.com", "shimmidresses.com"],
  },
];

function Spark({ size = 12, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden>
      <path
        d="M12 0c.7 6.4 4.9 10.6 12 12-7.1 1.4-11.3 5.6-12 12-.7-6.4-4.9-10.6-12-12C7.1 10.6 11.3 6.4 12 0z"
        fill="currentColor"
      />
    </svg>
  );
}

/* ================================================================== A */
/* POSTER — black rail, condensed labels, grid field, big pink numerals */

function DirectionA() {
  return (
    <div className="flex min-h-[720px] overflow-hidden rounded-xl border border-[#e4e1de] bg-white">
      <aside className="hidden w-[230px] shrink-0 flex-col bg-black px-4 py-5 md:flex">
        <div className="flex items-center gap-2 px-2">
          <img src="/globe.png" alt="" className="h-6 w-6" />
          <span className="font-[Anton] text-lg uppercase tracking-wide text-white">
            World Builder
          </span>
        </div>
        <nav className="mt-8 space-y-0.5">
          {["World Daily", "Drop Studio", "Talk to the Customer", "Drop History", "World Profile"].map(
            (n, i) => (
              <div
                key={n}
                className={`rounded-md px-3 py-2 text-sm ${
                  i === 0
                    ? "bg-[#ee6fc0] font-semibold text-black"
                    : "text-white/55"
                }`}
              >
                {n}
              </div>
            ),
          )}
        </nav>
        <div className="mt-auto border-t border-white/12 pt-4">
          <p className="font-[Anton] text-[11px] uppercase tracking-[0.16em] text-white/40">
            Current world
          </p>
          <p className="mt-1 font-[Anton] text-xl uppercase text-[#ee6fc0]">Quiet Faith</p>
        </div>
      </aside>

      <div
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.045) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      >
        <img
          src="/globe.png"
          alt=""
          className="pointer-events-none absolute -right-40 -top-24 h-[520px] w-[520px] max-w-none opacity-25"
        />
        <div className="relative px-7 py-8">
          <div className="flex items-baseline justify-between">
            <span className="font-[Anton] text-sm uppercase tracking-[0.18em] text-[#b02371]">
              World Daily
            </span>
            <span className="text-xs text-black/45">Saturday, August 22</span>
          </div>
          <h1 className="mt-3 max-w-xl font-[Anton] text-[2.6rem] uppercase leading-[0.94] tracking-tight text-black">
            Good afternoon.
            <br />
            <span className="text-[#ee6fc0]">Here&apos;s your world.</span>
          </h1>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {AREAS.map((a) => (
              <span
                key={a}
                className="rounded-sm border border-black px-2 py-0.5 text-[11px] font-medium"
              >
                {a}
              </span>
            ))}
          </div>

          <div className="mt-7 space-y-3">
            {ITEMS.map((it, i) => (
              <article
                key={i}
                className="flex gap-4 border-l-[3px] border-[#ee6fc0] bg-white px-5 py-4 shadow-[3px_3px_0_rgba(0,0,0,0.9)]"
              >
                <span className="font-[Anton] text-[2.4rem] leading-none text-[#ee6fc0]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <span className="font-[Anton] text-[11px] uppercase tracking-[0.16em] text-black/50">
                    {it.area}
                  </span>
                  <h2 className="mt-1 text-[17px] font-bold leading-snug">{it.headline}</h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-black/65">{it.body}</p>
                  <div className="mt-3 flex gap-1.5">
                    {it.sources.map((s) => (
                      <span key={s} className="border border-black/15 px-2 py-0.5 text-[11px]">
                        {s} ↗
                      </span>
                    ))}
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

/* ================================================================== B */
/* GALLERY — the globe is the hero. Air, thin rules, serif, restraint. */

function DirectionB() {
  return (
    <div className="relative min-h-[720px] overflow-hidden rounded-xl border border-[#e4e1de] bg-white">
      <img
        src="/globe.png"
        alt=""
        className="pointer-events-none absolute -right-[14%] top-1/2 h-[130%] w-auto max-w-none -translate-y-1/2 opacity-[0.5]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#fff_0%,#fff_48%,rgba(255,255,255,0.75)_62%,transparent_84%)]" />

      <div className="relative flex">
        <aside className="hidden w-[210px] shrink-0 px-5 py-7 md:block">
          <div className="flex items-center gap-2">
            <img src="/globe.png" alt="" className="h-5 w-5" />
            <span className="font-[Playfair_Display] text-lg">World Builder</span>
          </div>
          <nav className="mt-9 space-y-3">
            {["World Daily", "Drop Studio", "Talk to the Customer", "Drop History", "World Profile"].map(
              (n, i) => (
                <div key={n} className="flex items-center gap-2">
                  {i === 0 && <span className="h-3 w-[2px] bg-[#ee6fc0]" />}
                  <span className={`text-sm ${i === 0 ? "font-semibold" : "text-black/45"}`}>
                    {n}
                  </span>
                </div>
              ),
            )}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-8 py-10">
          <div className="flex items-center gap-2 text-[#b02371]">
            <Spark size={9} />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em]">
              World Daily
            </span>
            <span className="ml-auto text-xs text-black/40">Saturday, August 22</span>
          </div>
          <h1 className="mt-5 max-w-lg font-[Playfair_Display] text-[2.5rem] leading-[1.08] tracking-tight">
            Good afternoon.
          </h1>
          <p className="mt-2 max-w-md text-[17px] leading-relaxed text-black/55">
            Here&apos;s what&apos;s happening in your world today.
          </p>
          <span className="mt-5 block h-[2px] w-11 bg-[#ee6fc0]" />

          <div className="mt-9 max-w-xl divide-y divide-black/8">
            {ITEMS.map((it, i) => (
              <article key={i} className="py-7 first:pt-0">
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[#b02371]">
                  {it.area}
                </span>
                <h2 className="mt-2 font-[Playfair_Display] text-[1.5rem] leading-snug">
                  {it.headline}
                </h2>
                <p className="mt-2.5 text-[16px] leading-[1.7] text-black/62">{it.body}</p>
                <div className="mt-4 flex gap-4">
                  {it.sources.map((s) => (
                    <span
                      key={s}
                      className="border-b border-black/20 pb-0.5 text-[12.5px] text-black/50"
                    >
                      {s} ↗
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== C */
/* STUDIO — black masthead, bento cards, pink as a functional signal.   */

function DirectionC() {
  return (
    <div className="min-h-[720px] overflow-hidden rounded-xl border border-[#e4e1de] bg-[#f6f5f4]">
      <header className="relative overflow-hidden bg-black px-7 py-6">
        <img
          src="/globe.png"
          alt=""
          className="pointer-events-none absolute -right-16 -top-28 h-[340px] w-[340px] max-w-none opacity-30"
        />
        <div className="relative flex items-center gap-2">
          <span className="font-[Anton] text-base uppercase tracking-[0.14em] text-[#ee6fc0]">
            World Daily
          </span>
          <span className="ml-auto text-xs text-white/45">Saturday, August 22</span>
        </div>
        <h1 className="relative mt-3 max-w-lg font-[Playfair_Display] text-[2.4rem] leading-[1.1] text-white">
          Good afternoon, <span className="italic text-[#ee6fc0]">Quiet Faith</span>
        </h1>
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {AREAS.map((a) => (
            <span
              key={a}
              className="rounded-full bg-white/10 px-2.5 py-1 text-[11.5px] text-white/75"
            >
              {a}
            </span>
          ))}
        </div>
      </header>

      <nav className="flex gap-1 border-b border-black/8 bg-white px-7 py-2">
        {["World Daily", "Drop Studio", "Talk to the Customer", "Drop History", "World Profile"].map(
          (n, i) => (
            <span
              key={n}
              className={`rounded-md px-3 py-1.5 text-[13px] ${
                i === 0 ? "bg-black font-semibold text-white" : "text-black/50"
              }`}
            >
              {n}
            </span>
          ),
        )}
      </nav>

      <div className="grid gap-3 p-7 lg:grid-cols-2">
        <article className="rounded-xl border border-black/8 bg-white p-6 lg:row-span-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ee6fc0]" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-black/45">
              {ITEMS[0].area}
            </span>
          </div>
          <h2 className="mt-3 font-[Playfair_Display] text-[1.7rem] leading-snug">
            {ITEMS[0].headline}
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-black/62">{ITEMS[0].body}</p>
          <div className="mt-5 flex gap-1.5 border-t border-black/8 pt-4">
            {ITEMS[0].sources.map((s) => (
              <span
                key={s}
                className="rounded-md bg-[#f6f5f4] px-2.5 py-1 text-[11.5px] text-black/55"
              >
                {s} ↗
              </span>
            ))}
          </div>
        </article>

        {ITEMS.slice(1).map((it, i) => (
          <article key={i} className="rounded-xl border border-black/8 bg-white p-6">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ee6fc0]" />
              <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-black/45">
                {it.area}
              </span>
            </div>
            <h2 className="mt-3 font-[Playfair_Display] text-[1.3rem] leading-snug">
              {it.headline}
            </h2>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-black/60">{it.body}</p>
            <div className="mt-4 flex gap-1.5">
              {it.sources.map((s) => (
                <span
                  key={s}
                  className="rounded-md bg-[#f6f5f4] px-2.5 py-1 text-[11.5px] text-black/55"
                >
                  {s} ↗
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */

export default function Prototypes() {
  const blocks = [
    {
      key: "D",
      name: "Disco",
      pitch:
        "Built from your own marketing: iridescent pink ground, white cards floating on top with the Mac window dots, scattered stars, bold lowercase with pink italic emphasis inside the sentence. The ground is dialled back from your Instagram version so it survives eight hours of use.",
      node: <DirectionD />,
    },
    {
      key: "A",
      name: "Poster",
      pitch:
        "Closest to the challenge artwork. Black rail, condensed caps, grid field, hard offset shadows and big pink numerals. Loud, graphic, unmistakably yours.",
      node: <DirectionA />,
    },
    {
      key: "B",
      name: "Gallery",
      pitch:
        "The globe is the hero — huge, turning, half off the screen. Serif headlines, thin rules, a lot of air. Quiet and expensive rather than loud.",
      node: <DirectionB />,
    },
    {
      key: "C",
      name: "Studio",
      pitch:
        "Black masthead over a bento grid. Pink is a signal, not decoration. Feels like a professional tool that happens to be beautiful — closest to Listing Factory's structure.",
      node: <DirectionC />,
    },
  ];

  return (
    <main className="min-h-dvh bg-[#faf9f8] px-5 py-12 md:px-10">
      <div className="mx-auto max-w-[1180px]">
        <span className="font-[Anton] text-sm uppercase tracking-[0.18em] text-[#b02371]">
          Visual directions
        </span>
        <h1 className="mt-3 font-[Playfair_Display] text-[2.4rem] leading-tight">
          Four ways World Builder could look
        </h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-black/60">
          Same screen, same real content, four different treatments. D is new
          — built from your actual marketing rather than my guesses. Tell me a
          letter, or parts of two, and I will build the whole app in it.
        </p>

        <div className="mt-12 space-y-16">
          {blocks.map((b) => (
            <section key={b.key}>
              <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-[Anton] text-[2rem] leading-none text-[#ee6fc0]">
                  {b.key}
                </span>
                <h2 className="font-[Playfair_Display] text-[1.6rem]">{b.name}</h2>
                <p className="max-w-xl text-[14.5px] leading-relaxed text-black/55">
                  {b.pitch}
                </p>
              </div>
              {b.node}
            </section>
          ))}
        </div>

        <p className="mt-16 text-[14px] text-black/45">
          These are static mockups — nothing here is wired up, and the live app
          is untouched.
        </p>
      </div>
    </main>
  );
}
