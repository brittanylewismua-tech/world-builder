import Link from "next/link";
import Logo from "./Logo";
import { CONTACT, LAST_UPDATED } from "@/lib/legal";

/**
 * The frame both legal pages share.
 *
 * Deliberately plain and readable at a sensible measure. A legal page set in
 * grey six-point type is a page nobody reads, and an unread policy protects
 * nobody — least of all the person who wrote it.
 */
export default function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 md:px-8 md:py-16">
      <Link href="/" className="inline-block">
        <Logo height={20} />
      </Link>

      <h1 className="t-h1 mt-10 text-ink">{title}</h1>
      <p className="t-body mt-3 text-ink-2">{intro}</p>
      <p className="t-small mt-4 text-ink-3">Last updated {LAST_UPDATED}.</p>
      <span className="rule-accent mt-6 block" />

      <div className="legal mt-10">{children}</div>

      <footer className="mt-16 border-t-2 border-black pt-6">
        <p className="t-small text-ink-2">
          Questions about any of this go to{" "}
          <a
            href={`mailto:${CONTACT}`}
            className="font-semibold underline underline-offset-4"
          >
            {CONTACT}
          </a>
          .
        </p>
        <p className="t-small mt-4 text-ink-3">
          <Link href="/terms" className="underline underline-offset-4">
            Terms
          </Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-4">
            Privacy
          </Link>
          {" · "}
          <Link href="/" className="underline underline-offset-4">
            Back to World Builder
          </Link>
        </p>
      </footer>
    </main>
  );
}

/** A numbered section. */
export function Clause({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="t-h3 text-ink">
        <span className="numeral mr-2 text-ink-3">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}
