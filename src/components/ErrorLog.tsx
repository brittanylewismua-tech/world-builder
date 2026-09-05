"use client";

import { useCallback, useEffect, useState } from "react";
import { useOwnerToken } from "@/lib/ownerToken";
import { Page, Card, ErrorNote } from "@/components/ui";

/**
 * WHAT BROKE, FOR WHOM, AND WHEN.
 *
 * Failures have been recorded since the app was locked down and never once
 * looked at, which is the same as not recording them. This is the reading
 * end.
 *
 * IT LEADS WITH GROUPS, NOT ROWS. The first question on a bad morning is
 * "is this one person or everyone", and a reverse-chronological list answers
 * it slowest — the same message twenty times reads as twenty problems. So the
 * top of the page counts distinct messages and how many accounts each one
 * touched, and the raw list sits underneath for when a specific person writes
 * in.
 *
 * Every row names an account, because a user id cannot be replied to.
 */

interface Grouped {
  surface: string;
  message: string;
  hits: number;
  people: number;
  last: string;
}

interface Row {
  id: string;
  at: string;
  who: string;
  surface: string;
  message: string;
  where: string | null;
  detail: unknown;
}

interface Log {
  days: number;
  total: number;
  accounts: number;
  grouped: Grouped[];
  recent: Row[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function ErrorLog() {
  const token = useOwnerToken();
  const [log, setLog] = useState<Log | null>(null);
  const [days, setDays] = useState(7);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/admin/errors?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error ?? "Could not read the log.");
      setLog(body as Log);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read the log.");
    } finally {
      setBusy(false);
    }
  }, [days, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (token === undefined || (busy && !log))
    return <p className="t-small py-12 text-ink-3">Reading the log…</p>;
  if (err) return <ErrorNote>{err}</ErrorNote>;
  if (!log) return null;

  return (
    <>
      <header className="mb-10 border-b-2 border-black pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <span className="chip chip-solid">what broke</span>
          <span className="t-small text-ink-3">
            {[1, 7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className="ml-3 underline underline-offset-4"
                style={
                  d === days
                    ? { color: "var(--accent)", fontWeight: 700 }
                    : undefined
                }
              >
                {d === 1 ? "today" : `${d} days`}
              </button>
            ))}
            <button onClick={load} className="ml-4 underline underline-offset-4">
              refresh
            </button>
          </span>
        </div>
        <h1 className="t-h1 mt-3 text-ink">
          {log.total === 0 ? (
            <>
              nothing has{" "}
              <span className="italic" style={{ color: "var(--accent)" }}>
                broken
              </span>
            </>
          ) : (
            <>
              {log.total} {log.total === 1 ? "failure" : "failures"},{" "}
              <span className="italic" style={{ color: "var(--accent)" }}>
                {log.accounts} {log.accounts === 1 ? "account" : "accounts"}
              </span>
            </>
          )}
        </h1>
        <span className="rule-accent mt-4" />
      </header>

      {log.total === 0 && (
        <p className="t-body text-ink-2">
          No seller has hit an error in the last{" "}
          {log.days === 1 ? "day" : `${log.days} days`}.
        </p>
      )}

      {log.grouped.length > 0 && (
        <section className="mb-12">
          <p className="eyebrow mb-3 text-ink-3">
            By message — the same failure counted once
          </p>
          <Card className="overflow-hidden">
            {log.grouped.map((g, i) => (
              <div
                key={`${g.surface}-${i}`}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-black/10 px-4 py-3 last:border-0"
              >
                <span className="chip shrink-0">{g.surface}</span>
                <span className="t-small min-w-[16rem] flex-1 text-ink">
                  {g.message}
                </span>
                <span className="t-small shrink-0 text-ink-3">
                  {g.hits}×{" "}
                  {g.people > 1 ? (
                    /* More than one person is the number that matters. */
                    <strong className="text-ink">
                      {g.people} accounts
                    </strong>
                  ) : (
                    "1 account"
                  )}{" "}
                  · last {when(g.last)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {log.recent.length > 0 && (
        <section>
          <p className="eyebrow mb-3 text-ink-3">Every one, newest first</p>
          <Card className="overflow-hidden">
            {log.recent.map((r) => (
              <div key={r.id} className="border-b border-black/10 last:border-0">
                <button
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 text-left transition hover:bg-black/[0.03]"
                >
                  <span className="t-small shrink-0 text-ink-3">
                    {when(r.at)}
                  </span>
                  <span className="t-small shrink-0 font-semibold text-ink">
                    {r.who}
                  </span>
                  <span className="chip shrink-0">{r.surface}</span>
                  <span className="t-small min-w-[14rem] flex-1 text-ink-2">
                    {r.message}
                  </span>
                  {r.where && (
                    <span className="t-small shrink-0 text-ink-3">
                      {r.where}
                    </span>
                  )}
                </button>
                {open === r.id && (
                  <pre className="overflow-x-auto border-t border-black/10 bg-black/[0.03] px-4 py-3 text-[12px] leading-relaxed">
                    {JSON.stringify(r.detail, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}
    </>
  );
}

/* Kept so the page can render this on its own if it is ever split out. */
export function ErrorLogPage() {
  return (
    <Page width="full">
      <ErrorLog />
    </Page>
  );
}
