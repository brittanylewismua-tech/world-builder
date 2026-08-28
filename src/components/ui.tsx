/* eslint-disable @next/next/no-img-element */

/**
 * Layout kit for Direction E. One card style, one spacing scale, one type
 * ramp — every accent comes from the theme variables so the seller's colour
 * flows through without any component knowing about it.
 */

/** The window-dot motif from the brand, recoloured onto the palette. */
export function Dots({ onDark = false }: { onDark?: boolean }) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: "var(--accent)" }}
      />
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

export function Star({
  size = 14,
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

export function Page({
  children,
  width = "wide",
}: {
  children: React.ReactNode;
  width?: "narrow" | "reading" | "wide" | "full";
}) {
  const max =
    width === "narrow"
      ? "max-w-2xl"
      : width === "reading"
        ? "max-w-3xl"
        : width === "wide"
          ? "max-w-5xl"
          : "max-w-[1600px]";
  return (
    <main className={`relative z-10 mx-auto ${max} px-5 py-8 md:px-8 md:py-10`}>
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lede?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <span className="chip-solid chip mb-3">{eyebrow}</span>
        )}
        <h1 className="t-h1">{title}</h1>
        <span className="rule-accent mt-3" />
        {lede && <p className="t-body mt-3 max-w-xl text-ink-2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
  hover = false,
  dots = false,
  right,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
  hover?: boolean;
  dots?: boolean;
  right?: React.ReactNode;
}) {
  return (
    <section className={`card ${hover ? "card-hover" : ""} ${className}`}>
      {(dots || right) && (
        <div className="flex items-center justify-between gap-3 px-5 pt-4 md:px-6">
          {dots ? <Dots /> : <span />}
          {right}
        </div>
      )}
      <div className={pad ? "p-5 md:p-6" : ""}>{children}</div>
    </section>
  );
}

export function Panel({
  title,
  meta,
  aside,
  children,
  className = "",
}: {
  title: string;
  meta?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b-2 border-black px-5 py-3.5 md:px-6">
        <div className="min-w-0">
          <h2 className="t-h3">{title}</h2>
          {meta && <p className="t-small mt-0.5 text-ink-3">{meta}</p>}
        </div>
        {aside}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div className="note t-small mb-5 px-4 py-3 text-ink-2">{children}</div>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="t-small mb-5 rounded-xl border-2 border-black bg-[#ffe9e9] px-4 py-3 font-medium text-[#8a1a1a] shadow-[3px_3px_0_#000]">
      {children}
    </div>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-dashed border-black/25 px-6 py-12 text-center">
      <p className="t-h3">{title}</p>
      <p className="t-small mx-auto mt-1.5 max-w-sm text-ink-2">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/**
 * **Bold** inside a sentence, and nothing else.
 *
 * The reads are allowed to emphasise the words that carry the finding — a
 * number, a phrase off a shirt — and nothing more. A full markdown renderer
 * would be a dependency and a licence to produce headings and tables inside
 * a card that was not designed for them.
 */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-bold text-ink">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function Divider() {
  return <hr className="my-6 border-0 border-t-2 border-black/10" />;
}
