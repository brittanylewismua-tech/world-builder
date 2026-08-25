"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { splitDrops, syncSchedule, type Drop } from "@/lib/drops";
import { laneFromBoardName } from "@/lib/board";
import type { World } from "@/lib/world";

/**
 * PINTEREST IS WHERE THEY ALREADY COLLECT.
 *
 * Sellers pin all week from their phone, and then the pile sits there being a
 * pile. Pinterest can hold a thousand images and tell you nothing about them —
 * it cannot say that six are the same composition, or that a phrase saved in
 * March belongs on the drop being built now.
 *
 * So this is not "another integration". It is the front door: they keep
 * collecting where they already collect, and the thinking happens here.
 *
 * Boards are pointed at a destination rather than dumped in one place,
 * because a board of your own taste and a board of other people's shops mean
 * completely different things and must not be read back as if they were the
 * same.
 */

type Destination = "calibration" | "research" | "reference";
type Lane = "visual" | "market";

/*
  Asked once per board rather than once per pin — but only as a fallback. The
  real answer is that the seller keeps four boards with these names, so the
  board she picks already says which lane it is and this never has to be
  touched. See laneFromBoardName.
*/
const LANES: { id: Lane | ""; name: string }[] = [
  { id: "visual", name: "Design inspo" },
  { id: "market", name: "Etsy bestsellers" },
  { id: "", name: "decide later" },
];

const WHERE: { id: Destination; name: string; blurb: string }[] = [
  {
    id: "calibration",
    name: "This is my eye",
    blurb:
      "Lands in Visual Calibration. Sets the style the AI pictures when it pictures your world.",
  },
  {
    id: "research",
    name: "This is for my next drop",
    blurb:
      "Lands on the research board for the drop you are researching, ready when you build it.",
  },
  {
    id: "reference",
    name: "This is what shops in my world look like",
    blurb:
      "Lands on the same board, marked as reference — other people's work, never mistaken for your direction.",
  },
];

interface Board {
  id: string;
  name: string;
  description: string;
  pinCount: number;
  cover: string | null;
}

async function call<T>(path: string, payload: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("You are signed out. Reload and sign in again.");
  const r = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || "That did not go through.");
  return body as T;
}

export default function PinterestBoards({ world }: { world: World }) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [nextDrop, setNextDrop] = useState<Drop | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane | "">("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState<Record<string, string>>({});
  /*
    The callback returns with an outcome in the URL and, until now, nothing
    displayed it. A seller who was bounced back for any reason simply saw the
    connect button again and no explanation, which reads as the feature being
    broken rather than as something they can retry.
  */
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const said = new URLSearchParams(window.location.search).get("pinterest");
    if (!said) return;
    setOutcome(said);
    // Clear it so a refresh does not replay a stale message.
    const url = new URL(window.location.href);
    url.searchParams.delete("pinterest");
    window.history.replaceState({}, "", url);
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await call<{ connected: boolean; boards: Board[] }>(
        "/api/pinterest/boards",
        { worldId: world.id },
      );
      setConnected(r.connected);
      setBoards(r.boards ?? []);
    } catch (e) {
      setConnected(false);
      setErr(e instanceof Error ? e.message : "Could not reach Pinterest.");
    }
  }, [world.id]);

  useEffect(() => {
    load();
    syncSchedule(world)
      .then((all) => setNextDrop(splitDrops(all).next))
      .catch(() => setNextDrop(null));
  }, [world, load]);

  async function connect() {
    setBusy("connect");
    setErr("");
    try {
      const { url } = await call<{ url: string }>("/api/pinterest/start", {
        worldId: world.id,
      });
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start that.");
      setBusy(null);
    }
  }

  async function bring(board: Board, destination: Destination) {
    setBusy(board.id);
    setErr("");
    setChoosing(null);
    try {
      const r = await call<{ imported: number; skipped: number; note?: string }>(
        "/api/pinterest/import",
        {
          worldId: world.id,
          boardId: board.id,
          boardName: board.name,
          destination,
          lane: destination === "research" ? lane || null : null,
          dropId: destination === "calibration" ? null : nextDrop?.id ?? null,
        },
      );
      setDone((d) => ({
        ...d,
        [board.id]:
          r.imported > 0
            ? `Brought in ${r.imported} pin${r.imported === 1 ? "" : "s"}${r.skipped ? `, skipped ${r.skipped} already here` : ""}`
            : (r.note ?? "Nothing new on that board"),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That import did not finish.");
    } finally {
      setBusy(null);
    }
  }

  const SAID: Record<string, string> = {
    connected: "Pinterest connected.",
    cancelled: "You cancelled on Pinterest — nothing was connected.",
    expired:
      "That took long enough that the secure link timed out. Press connect and approve it, and it will go through.",
    failed:
      "Pinterest did not complete the connection. Trying again usually sorts it.",
  };

  const notice =
    outcome && SAID[outcome] ? (
      <p
        className={`t-small mb-3 rounded-lg border px-3 py-2 ${
          outcome === "connected"
            ? "border-black/15 bg-white text-ink-2"
            : "border-[#f3c9c9] bg-[#fdf0f0] text-[#8a2020]"
        }`}
      >
        {SAID[outcome]}
      </p>
    ) : null;

  if (connected === null)
    return (
      <div>
        {notice}
        <p className="t-small text-ink-3">Checking Pinterest…</p>
      </div>
    );

  if (!connected)
    return (
      <div>
        {notice}
        <p className="t-body max-w-md text-ink-2">
          Bring your Pinterest boards in as research for your drops.
        </p>
        <p className="t-small mt-2 max-w-md text-ink-3">
          Read-only. Nothing is ever pinned, changed or deleted on your
          account. Secret boards are not shared with this app yet.
        </p>
        <button
          onClick={connect}
          disabled={busy !== null}
          className="btn btn-accent mt-4"
        >
          {busy ? "Opening Pinterest…" : "Connect Pinterest"}
        </button>
        {err && <p className="t-small mt-3 text-ink-2">{err}</p>}
      </div>
    );

  return (
    <div>
      {notice}
      {/*
        This had three paragraphs explaining a two-column filing system, a
        rule about skipping duplicates, and an instruction to keep particular
        boards. None of it was needed to press a button next to a board, and
        all of it was in the way of doing so.
      */}
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="t-small text-ink-2">
          Bring a board in and its pins land on your research board.
        </p>
        {/*
          Scopes are granted once, at connect time, so a token issued before
          the secret-board scopes existed will never see a secret board no
          matter what the code asks for. Reconnecting is the only way to widen
          an existing grant, and without a way to do it the seller is stuck
          with an invisible ceiling.
        */}
        <button
          onClick={connect}
          disabled={busy !== null}
          className="t-small ml-auto text-ink-3 underline underline-offset-2 transition hover:text-ink"
        >
          Reconnect
        </button>
      </div>

      {/*
        Said out loud rather than left as a mystery. Pinterest will not hand a
        Production Limited app anybody's secret boards, so a seller whose
        competitor board is secret would otherwise just keep looking for it.
      */}
      <p className="t-small mb-4 text-ink-3">
        Secret boards will not appear — Pinterest only shares those with apps
        on standard access.
      </p>

      {boards.length === 0 && (
        <p className="t-small mt-4 text-ink-3">
          No boards came back from Pinterest.
        </p>
      )}

      <ul className="mt-4 space-y-2">
        {boards.map((b) => (
          <li key={b.id} className="card overflow-hidden">
            <div className="flex items-center gap-3 p-3">
              {b.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={b.cover}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-lg bg-black/8" />
              )}
              <span className="min-w-0 flex-1">
                <span className="t-h3 block truncate text-ink">{b.name}</span>
                <span className="t-small block text-ink-3">
                  {b.pinCount} pin{b.pinCount === 1 ? "" : "s"}
                  {done[b.id] && ` · ${done[b.id]}`}
                </span>
              </span>
              <button
                onClick={() => {
                  const opening = choosing !== b.id;
                  setChoosing(opening ? b.id : null);
                  // Somebody who followed the workflow named this board
                  // "Quotes". Answer the question for her.
                  if (opening)
                    setLane((laneFromBoardName(b.name) as Lane | null) ?? "");
                }}
                disabled={busy !== null}
                className="btn btn-ghost shrink-0"
              >
                {busy === b.id ? "Bringing it in…" : "Bring it in"}
              </button>
            </div>

            {choosing === b.id && (
              <div className="rise space-y-1.5 border-t border-black/12 bg-[#faf9f8] p-3">
                {/* Only the seller's own research needs a lane. Calibration
                    is not a board, and reference is other people's shops. */}
                <div className="mb-2 rounded-lg border border-black/12 bg-white p-2.5">
                  <p className="eyebrow mb-1.5 text-ink-3">
                    File these as
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {LANES.map((l) => (
                      <button
                        key={l.id || "none"}
                        onClick={() => setLane(l.id)}
                        className={`rounded-md border px-2 py-1 text-[12.5px] transition ${
                          lane === l.id
                            ? "border-black bg-black text-white"
                            : "border-black/15 text-ink-2 hover:border-black"
                        }`}
                      >
                        {l.name}
                      </button>
                    ))}
                  </div>
                </div>

                {WHERE.map((w) => {
                  const needsDrop = w.id !== "calibration" && !nextDrop;
                  return (
                    <button
                      key={w.id}
                      onClick={() => bring(b, w.id)}
                      disabled={needsDrop}
                      className="block w-full rounded-lg border border-black/12 bg-white p-3 text-left transition hover:border-black disabled:opacity-40"
                    >
                      <span className="t-small block font-semibold text-ink">
                        {w.name}
                      </span>
                      <span className="t-small block text-ink-3">
                        {needsDrop
                          ? "Open Drop Studio once and this becomes available."
                          : w.blurb}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </li>
        ))}
      </ul>

      {err && <p className="t-small mt-3 text-ink-2">{err}</p>}
    </div>
  );
}
