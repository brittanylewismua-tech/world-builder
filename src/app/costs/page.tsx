"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Page, Card, ErrorNote } from "@/components/ui";

/**
 * WHAT THIS COSTS, AND WHERE IT COMES FROM.
 *
 * Not a seller surface — this is the business's cost base, and one seller's
 * spend is legible in it. It lives outside the app shell on purpose: no nav
 * link, no mention anywhere a seller can see, and the route behind it refuses
 * anyone whose signed-in email is not on the owner list.
 *
 * WHAT IT IS FOR. Three questions, in this order:
 *
 *   Am I spending more than I thought?      — the four numbers at the top.
 *   Which feature is doing it?              — by feature, sorted by cost.
 *   Is one account running away with it?    — per seller, worst case first.
 *
 * The per-call number matters more than the total wherever volumes differ.
 * A feature with a big total and a tiny per-call price is just popular; a
 * feature with a small total and a large per-call price is the one that will
 * hurt when it becomes popular.
 */

interface Surface {
  surface: string;
  cost: number;
  calls: number;
  perCall: number;
  input: number;
  output: number;
  cache: number;
  search: number;
  ms: number;
}

interface Report {
  generatedAt: string;
  totals: {
    today: number;
    yesterday: number;
    week: number;
    month: number;
    calls: number;
    callsToday: number;
    cacheSaved: number;
    searchCost: number;
    unpriced: number;
  };
  allTime: { cost: number; calls: number; since: string | null };
  daily: { day: string; cost: number; calls: number }[];
  bySurface: Surface[];
  byModel: { model: string; cost: number; calls: number; perCall: number }[];
  sellers: { active: number; perHead: number; median: number; worst: number };
  topSellers: { userId: string; cost: number; calls: number }[];
  byVia: { via: string; cost: number; calls: number }[];
  prices: {
    model: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    note: string | null;
  }[];
}

/* Money, at the precision the number deserves. Fractions of a cent are noise
   at the top of the page and the whole story at the per-call level. */
const usd = (n: number, small = false) =>
  small && n < 1
    ? `${(n * 100).toFixed(n < 0.1 ? 2 : 1)}¢`
    : `$${n.toFixed(n < 10 ? 2 : 0)}`;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** What a feature is called in the product, rather than in the database. */
const FEATURE: Record<string, string> = {
  daily: "World News",
  shops: "World Shops",
  winners: "World Winners",
  world: "World Winners — whole world",
  board: "Drop research board",
  room: "Creative Room",
  customer: "Talk to the customer",
  areas: "Setup — suggested areas",
  web: "World Web (removed)",
  canon: "World Web (removed)",
};

export default function CostsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);

  const load = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in first.");
      const r = await fetch("/api/admin/costs", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? "Could not read the ledger.");
      setReport(body as Report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the ledger.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (busy && !report)
    return (
      <Page width="full">
        <p className="t-small py-12 text-ink-3">Adding it up…</p>
      </Page>
    );

  if (err)
    return (
      <Page width="full">
        <ErrorNote>{err}</ErrorNote>
      </Page>
    );

  if (!report) return null;

  const t = report.totals;
  /*
    Thirty days of history projected forward. Said as a run rate rather than
    a forecast, because it is arithmetic on the recent past and nothing more.
  */
  const runRate = (t.month / 30) * 30;
  const peak = Math.max(...report.daily.map((d) => d.cost), 0.0001);

  return (
    <Page width="full">
      <header className="mb-12 border-b-2 border-black pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <span className="chip chip-solid">what this costs</span>
          <span className="t-small text-ink-3">
            {t.calls.toLocaleString()} calls in 30 days · read{" "}
            {new Date(report.generatedAt).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            ·{" "}
            <button onClick={load} className="underline underline-offset-4">
              refresh
            </button>
          </span>
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          every model call,{" "}
          <span className="italic" style={{ color: "var(--accent)" }}>
            in dollars
          </span>
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {t.unpriced > 0 && (
        <ErrorNote>
          {t.unpriced} calls used a model with no price on file, so they are
          counted as zero and this total is too low. Add the model to
          wb_model_price.
        </ErrorNote>
      )}

      {/* ------------------------------------------------- the four numbers */}
      <div className="mb-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Big label="Today" value={usd(t.today)} under={`${t.callsToday} calls`} />
        <Big
          label="Yesterday"
          value={usd(t.yesterday)}
          under={
            t.yesterday > 0
              ? `${t.today >= t.yesterday ? "up" : "down"} ${Math.abs(
                  Math.round(((t.today - t.yesterday) / t.yesterday) * 100),
                )}% today`
              : "nothing spent"
          }
        />
        <Big label="Last 7 days" value={usd(t.week)} under={`${usd(t.week / 7)} a day`} />
        <Big
          label="Last 30 days"
          value={usd(t.month)}
          under={`about ${usd(runRate)} a month at this rate`}
          loud
        />
      </div>

      {/* ------------------------------------------------------- day by day */}
      <section className="mb-16">
        <h2 className="t-h3 mb-1 text-ink">Day by day</h2>
        <p className="t-small mb-5 text-ink-3">
          Thirty days. A gap is a day nothing ran, not missing data.
        </p>
        <div className="flex h-40 items-end gap-[3px]">
          {report.daily.map((d) => (
            <div
              key={d.day}
              className="group relative flex-1"
              title={`${day(d.day)} — ${usd(d.cost, true)} across ${d.calls} calls`}
            >
              <div
                className="w-full rounded-t-sm transition"
                style={{
                  height: `${Math.max(2, (d.cost / peak) * 152)}px`,
                  background: d.cost > 0 ? "var(--accent)" : "rgba(0,0,0,0.08)",
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between">
          <span className="t-small text-ink-3">
            {report.daily.length ? day(report.daily[0].day) : ""}
          </span>
          <span className="t-small text-ink-3">
            peak {usd(peak, true)} in a day
          </span>
          <span className="t-small text-ink-3">today</span>
        </div>
      </section>

      {/* ----------------------------------------------------- by feature */}
      <section className="mb-16">
        <h2 className="t-h3 mb-1 text-ink">Where it comes from</h2>
        <p className="t-small mb-5 max-w-[70ch] text-ink-3">
          The per-call price is the one to watch. A big total with a cheap call
          is a popular feature; a small total with an expensive call is the one
          that will hurt when it gets popular.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <Th>Feature</Th>
                <Th right>30 days</Th>
                <Th right>Calls</Th>
                <Th right>Per call</Th>
                <Th right>Typical wait</Th>
                <Th>Inside the call</Th>
              </tr>
            </thead>
            <tbody>
              {report.bySurface.map((s) => (
                <tr key={s.surface} className="border-b border-black/10">
                  <td className="py-3 pr-4">
                    <span className="text-[15px] text-ink">
                      {FEATURE[s.surface] ?? s.surface}
                    </span>
                  </td>
                  <td className="numeral py-3 pr-4 text-right text-ink">
                    {usd(s.cost)}
                  </td>
                  <td className="numeral py-3 pr-4 text-right text-ink-2">
                    {s.calls}
                  </td>
                  <td
                    className="numeral py-3 pr-4 text-right"
                    style={{ color: "var(--accent)" }}
                  >
                    {usd(s.perCall, true)}
                  </td>
                  <td className="numeral py-3 pr-4 text-right text-ink-3">
                    {(s.ms / 1000).toFixed(0)}s
                  </td>
                  <td className="py-3">
                    <Split
                      parts={[
                        ["input", s.input, "var(--accent)"],
                        ["output", s.output, "rgba(0,0,0,0.75)"],
                        ["cache", s.cache, "rgba(0,0,0,0.35)"],
                        ["search", s.search, "rgba(0,0,0,0.15)"],
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="t-small mt-3 text-ink-3">
          Input · output · cache · web search. Web search is billed per search,
          not per token — {usd(t.searchCost)} of the 30-day total.
        </p>
      </section>

      {/* ------------------------------------------------------- per seller */}
      <section className="mb-16 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="t-h3 mb-1 text-ink">Per seller</h2>
          <p className="t-small mb-5 text-ink-3">
            Thirty days, counting only accounts that actually used something.
          </p>
          <dl className="space-y-3">
            <Row k="Active sellers" v={String(report.sellers.active)} />
            <Row k="Average" v={usd(report.sellers.perHead)} loud />
            <Row k="Median" v={usd(report.sellers.median)} />
            <Row k="Heaviest one" v={usd(report.sellers.worst)} />
          </dl>
          <p className="t-small mt-5 border-t border-black/10 pt-4 text-ink-3">
            The average is the number a subscription price has to clear. The
            heaviest is the number that says whether the caps sit in the right
            place.
          </p>
        </Card>

        <Card>
          <h2 className="t-h3 mb-1 text-ink">Who</h2>
          <p className="t-small mb-5 text-ink-3">
            Heaviest accounts, and what ran without anybody asking.
          </p>
          <dl className="space-y-2">
            {report.topSellers.map((s) => (
              <Row
                key={s.userId}
                k={`${s.userId.slice(0, 8)}… · ${s.calls} calls`}
                v={usd(s.cost)}
              />
            ))}
            {!report.topSellers.length && (
              <p className="t-small text-ink-3">Nobody yet.</p>
            )}
          </dl>
          <div className="mt-5 border-t border-black/10 pt-4">
            {report.byVia.map((v) => (
              <Row
                key={v.via}
                k={v.via === "cron" ? "The overnight job" : "People in the app"}
                v={`${usd(v.cost)} · ${v.calls} calls`}
              />
            ))}
          </div>
        </Card>
      </section>

      {/* ---------------------------------------------------- models, prices */}
      <section className="mb-16 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="t-h3 mb-5 text-ink">By model</h2>
          <dl className="space-y-3">
            {report.byModel.map((m) => (
              <Row
                key={m.model}
                k={`${m.model.replace("-20251001", "")} · ${m.calls} calls`}
                v={`${usd(m.cost)} · ${usd(m.perCall, true)} each`}
              />
            ))}
          </dl>
          <p className="t-small mt-5 border-t border-black/10 pt-4 text-ink-3">
            Prompt caching saved {usd(t.cacheSaved, true)} over the 30 days.
          </p>
        </Card>

        <Card>
          <h2 className="t-h3 mb-1 text-ink">The prices behind all of this</h2>
          <p className="t-small mb-5 text-ink-3">
            Dollars per million tokens. Change them in wb_model_price and every
            number on this page reprices, including the history.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-black/20 text-left">
                  <Th>Model</Th>
                  <Th right>In</Th>
                  <Th right>Out</Th>
                  <Th right>Cache read</Th>
                  <Th right>Cache write</Th>
                </tr>
              </thead>
              <tbody>
                {report.prices.map((p) => (
                  <tr key={p.model} className="border-b border-black/10">
                    <td className="py-2 pr-3 text-[14px] text-ink">
                      {p.model.replace("-20251001", "")}
                    </td>
                    <td className="numeral py-2 pr-3 text-right text-ink-2">
                      ${p.input}
                    </td>
                    <td className="numeral py-2 pr-3 text-right text-ink-2">
                      ${p.output}
                    </td>
                    <td className="numeral py-2 pr-3 text-right text-ink-2">
                      ${p.cacheRead}
                    </td>
                    <td className="numeral py-2 text-right text-ink-2">
                      ${p.cacheWrite}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <p className="t-small pb-16 text-ink-3">
        Since {report.allTime.since ? day(report.allTime.since) : "the start"}:{" "}
        {usd(report.allTime.cost)} across{" "}
        {report.allTime.calls.toLocaleString()} calls.
      </p>
    </Page>
  );
}

/* ------------------------------------------------------------------ */

function Big({
  label,
  value,
  under,
  loud = false,
}: {
  label: string;
  value: string;
  under: string;
  loud?: boolean;
}) {
  return (
    <Card>
      <p className="t-small text-ink-3">{label}</p>
      <p
        className="numeral mt-1 text-[2.4rem] leading-none"
        style={{ color: loud ? "var(--accent)" : undefined }}
      >
        {value}
      </p>
      <p className="t-small mt-2 text-ink-3">{under}</p>
    </Card>
  );
}

function Th({
  children,
  right = false,
}: {
  children: React.ReactNode;
  right?: boolean;
}) {
  return (
    <th
      className={`t-small pb-2 font-semibold text-ink-3 ${right ? "pr-4 text-right" : "pr-4"}`}
    >
      {children}
    </th>
  );
}

function Row({ k, v, loud = false }: { k: string; v: string; loud?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="t-small text-ink-2">{k}</dt>
      <dd
        className="numeral shrink-0 text-[15px]"
        style={{ color: loud ? "var(--accent)" : undefined }}
      >
        {v}
      </dd>
    </div>
  );
}

/** Where the money went inside one feature's calls. */
function Split({ parts }: { parts: [string, number, string][] }) {
  const total = parts.reduce((n, [, v]) => n + v, 0) || 1;
  return (
    <div className="flex h-2.5 w-full min-w-[120px] overflow-hidden rounded-full">
      {parts.map(([name, v, colour]) => (
        <div
          key={name}
          title={`${name} ${Math.round((v / total) * 100)}%`}
          style={{ width: `${(v / total) * 100}%`, background: colour }}
        />
      ))}
    </div>
  );
}
