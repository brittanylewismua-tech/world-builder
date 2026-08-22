/* eslint-disable @next/next/no-img-element */

/**
 * DIRECTION D — the actual brand.
 *
 * Taken from Brittany's own marketing: iridescent pink ground, white cards
 * with big radii floating on top, Mac window dots as the signature card
 * motif, scattered white stars, bold lowercase headings with pink italic
 * emphasis inside the sentence.
 *
 * The one adaptation for a tool you sit in daily: the disco-ball ground is
 * dialled well back from the Instagram version, and the reading column gets
 * a white card so long text never sits on the wash.
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

/** The signature: Mac window chrome on every card. */
function Dots() {
  return (
    <div className="flex gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
      <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
    </div>
  );
}

function Star({
  size = 16,
  className = "",
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={style}
      aria-hidden
    >
      <path
        d="M12 0l2.9 8.6L24 9.2l-7.2 5.3 2.6 8.9L12 18.2 4.6 23.4l2.6-8.9L0 9.2l9.1-.6z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function DirectionD() {
  return (
    <div className="proto-d relative min-h-[760px] overflow-hidden rounded-2xl">
      {/* iridescent ground, dialled back for daily use */}
      <div className="absolute inset-0 bg-[#f7d9ec]" />
      <div className="absolute inset-0 bg-[radial-gradient(680px_520px_at_8%_-6%,rgba(198,164,232,0.85),transparent_62%),radial-gradient(720px_560px_at_98%_10%,rgba(255,196,224,0.9),transparent_60%),radial-gradient(760px_620px_at_45%_112%,rgba(214,178,240,0.8),transparent_62%)]" />
      <img
        src="/globe.png"
        alt=""
        className="pointer-events-none absolute -right-24 -top-20 h-[440px] w-[440px] max-w-none opacity-30 mix-blend-luminosity"
      />
      <img
        src="/globe.png"
        alt=""
        className="pointer-events-none absolute -bottom-32 -left-24 h-[380px] w-[380px] max-w-none opacity-25 mix-blend-luminosity"
      />

      {/* scattered stars */}
      <Star size={22} className="absolute left-[36%] top-[6%] text-white/85" />
      <Star size={13} className="absolute left-[30%] top-[16%] text-white/60" />
      <Star size={17} className="absolute right-[8%] top-[42%] text-white/70" />
      <Star size={12} className="absolute right-[18%] bottom-[10%] text-white/60" />
      <Star size={19} className="absolute left-[6%] bottom-[30%] text-white/70" />

      <div className="relative flex">
        {/* sidebar as a floating white card */}
        <div className="hidden w-[238px] shrink-0 p-4 md:block">
          <div className="rounded-[22px] bg-white p-4 shadow-[0_10px_30px_-14px_rgba(120,60,100,0.4)]">
            <Dots />
            <div className="mt-4 flex items-center gap-2">
              <img src="/globe.png" alt="" className="h-7 w-7" />
              <span className="text-[17px] font-extrabold leading-none tracking-tight">
                world builder
              </span>
            </div>

            <nav className="mt-5 space-y-1">
              {[
                "world daily",
                "drop studio",
                "talk to the customer",
                "drop history",
                "world profile",
              ].map((n, i) => (
                <div
                  key={n}
                  className={`rounded-full px-3.5 py-2 text-[13.5px] font-semibold transition ${
                    i === 0
                      ? "bg-[#ee6fc0] text-white"
                      : "text-black/45 hover:bg-black/[0.04]"
                  }`}
                >
                  {n}
                </div>
              ))}
            </nav>

            <div className="mt-5 rounded-2xl bg-[#fdeef7] p-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#b02371]">
                your world
              </p>
              <p className="mt-1 text-[17px] font-extrabold tracking-tight">
                quiet faith
              </p>
              <p className="mt-0.5 text-[12px] text-black/50">day 14 · 6 niches</p>
            </div>
          </div>
        </div>

        {/* main column */}
        <div className="min-w-0 flex-1 p-4 md:py-6 md:pr-6">
          {/* masthead card */}
          <div className="relative rounded-[24px] bg-white px-7 py-7 shadow-[0_14px_40px_-18px_rgba(120,60,100,0.45)]">
            <div className="flex items-start justify-between">
              <Dots />
              <span className="text-[12.5px] font-semibold text-black/40">
                saturday, august 22 🌍
              </span>
            </div>
            <h1 className="mt-5 max-w-2xl text-[2.15rem] font-extrabold leading-[1.12] tracking-[-0.02em]">
              good afternoon — here&apos;s what your customer is{" "}
              <span className="italic text-[#ee6fc0]">obsessed with</span> today
              🔥
            </h1>
            <div className="mt-5 flex flex-wrap gap-2">
              {AREAS.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-[#fdeef7] px-3 py-1.5 text-[12.5px] font-semibold text-[#b02371]"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>

          {/* item cards */}
          <div className="mt-4 space-y-4">
            {ITEMS.map((it, i) => (
              <article
                key={i}
                className="proto-d-card rounded-[24px] bg-white px-7 py-6 shadow-[0_14px_40px_-20px_rgba(120,60,100,0.42)]"
              >
                <div className="flex items-center justify-between">
                  <Dots />
                  <span className="rounded-full bg-black px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-white">
                    {it.area}
                  </span>
                </div>
                <div className="mt-4 flex gap-4">
                  <span className="text-[2.6rem] font-extrabold leading-none tracking-tight text-[#ee6fc0]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[1.32rem] font-extrabold leading-snug tracking-[-0.015em]">
                      {it.headline}
                    </h2>
                    <p className="mt-2 text-[15px] leading-relaxed text-black/62">
                      {it.body}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {it.sources.map((s) => (
                        <span
                          key={s}
                          className="rounded-full border border-black/10 px-3 py-1 text-[12px] font-medium text-black/55"
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
