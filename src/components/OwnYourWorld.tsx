"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteWorldForever, downloadExport, exportWorld } from "@/lib/ownYourWorld";
import type { World } from "@/lib/world";

/**
 * The two things a person should always be able to do with their own work:
 * take it, and end it.
 *
 * Deleting is deliberately awkward. Typing the world's name is not a UX
 * flourish — it is the difference between a mis-click and a decision, and
 * there is no undo behind it.
 */
export default function OwnYourWorld({ world }: { world: World }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [armed, setArmed] = useState(false);
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const target = world.name.trim() || "my world";
  const matches = typed.trim().toLowerCase() === target.toLowerCase();

  async function exportNow() {
    setBusy("export");
    setErr("");
    setDone(false);
    try {
      downloadExport(await exportWorld(world), target);
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "The export did not finish.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteNow() {
    if (!matches) return;
    setBusy("delete");
    setErr("");
    try {
      await deleteWorldForever(world);
      router.replace("/setup");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not delete.");
      setBusy(null);
    }
  }

  return (
    <section className="card p-5 md:p-6">
      <h3 className="t-h3 text-ink">Your world is yours</h3>

      <div className="mt-4">
        <p className="t-small max-w-xl text-ink-2">
          Download everything — your keywords, what you have watched, every
          drop, every research board, and every conversation — as one file you
          keep. It stays readable whether or not you ever open this again.
        </p>
        <button
          onClick={exportNow}
          disabled={busy !== null}
          className="btn btn-ghost mt-3"
        >
          {busy === "export" ? "Gathering it up…" : "Download my world"}
        </button>
        {done && (
          <p className="t-small mt-2 text-ink-2">
            Saved. Images stay on your own machine — the file records their
            names, not the pictures.
          </p>
        )}
      </div>

      <div className="mt-7 border-t border-black/12 pt-5">
        {!armed ? (
          <>
            <p className="t-small max-w-xl text-ink-2">
              Or delete this world and everything in it — the research, the
              drops, the uploads, all of it. This cannot be undone and nothing
              is kept in the background.
            </p>
            <button
              onClick={() => setArmed(true)}
              className="t-small mt-3 font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              Delete this world
            </button>
          </>
        ) : (
          <div className="rise">
            <p className="t-h3 text-ink">This deletes everything, permanently</p>
            <p className="t-small mt-1 max-w-xl text-ink-2">
              Consider downloading your world first — once this is done there
              is nothing to recover, by you or by anyone else. Type{" "}
              <span className="font-semibold text-ink">{target}</span> to
              confirm.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={target}
                className="field max-w-xs"
                autoFocus
              />
              <button
                onClick={deleteNow}
                disabled={!matches || busy !== null}
                className="btn shrink-0 border-2 border-black bg-black text-white disabled:opacity-35"
              >
                {busy === "delete" ? "Deleting…" : "Delete it all"}
              </button>
              <button
                onClick={() => {
                  setArmed(false);
                  setTyped("");
                }}
                className="btn btn-ghost shrink-0"
              >
                Keep my world
              </button>
            </div>
          </div>
        )}
      </div>

      {err && <p className="t-small mt-3 text-ink-2">{err}</p>}
    </section>
  );
}
