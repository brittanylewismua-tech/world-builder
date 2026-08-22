import { Sparkle } from "./Globe";

/**
 * Layout primitives. Every surface uses these so padding, gutters and type
 * ramp stay identical across the app — the research point that a single
 * spacing scale and one type ramp is what makes pages feel native to
 * each other.
 */

/** Standard page frame. `width` controls the reading measure. */
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
  return <main className={`mx-auto ${max} px-5 py-8 md:px-8`}>{children}</main>;
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 flex items-center gap-1.5 text-pink-ink">
            <Sparkle size={10} />
            <span className="eyebrow">{eyebrow}</span>
          </div>
        )}
        <h1 className="t-h1 text-plum">{title}</h1>
        {lede && <p className="t-body mt-2 max-w-xl text-plum-2">{lede}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`card ${pad ? "p-5 md:p-6" : ""} ${className}`}>
      {children}
    </section>
  );
}

/** Card with a titled head — the standard content box. */
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
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5 md:px-6">
        <div className="min-w-0">
          <h2 className="t-h3 text-plum">{title}</h2>
          {meta && <p className="t-small mt-0.5 text-plum-3">{meta}</p>}
        </div>
        {aside}
      </div>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

/** The quiet "how this works" explainer. Never shouty. */
export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="note t-small mb-5 px-4 py-3 text-plum-2">{children}</div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="t-small mb-5 rounded-lg border border-[#f3c9c9] bg-[#fdf0f0] px-4 py-3 text-[#8a2020]">
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
    <div className="rounded-2xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="t-h3 text-plum">{title}</p>
      <p className="t-small mx-auto mt-1.5 max-w-sm text-plum-2">{body}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function Divider() {
  return <hr className="my-6 border-0 border-t border-line" />;
}
