/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  addImage,
  addLink,
  addText,
  analyzeItem,
  dismissFinding,
  findPatterns,
  loadLater,
  openBoard,
  removeItem,
  setIntention,
  updateItem,
  SECTIONS,
  SECTION_NAME,
  type Board,
  type BoardItem,
  type Finding,
  type Section,
} from "@/lib/board";
import { formatDropDate, type Drop } from "@/lib/drops";
import type { World } from "@/lib/world";
import { report } from "@/lib/report";
import { Dots, Star } from "./ui";

/**
 * THE UPCOMING DROP RESEARCH BOARD
 *
 * Next week's drop, filling up quietly while this week's gets built. It has
 * to feel like a board you want to throw things at — spacious, visual, a
 * little messy — not a form, a folder tree or a research report. Nothing is
 * required, nothing is scored, and there is no target number of pieces.
 *
 * Sections exist so the AI can compare like with like, and because a wall of
 * forty unsorted cards stops being scannable. They are areas of a board, not
 * filing cabinets: the AI proposes one, the seller moves it or ignores it.
 */

const IMAGE_HEIGHTS = ["h-44", "h-60", "h-52", "h-72", "h-48"];

/**
 * THE BOARD SITS BESIDE THE CONVERSATION.
 *
 * Everything used to be stacked down one page: intention, then the add bar,
 * then findings, then four open sections of images, and the Creative Room
 * somewhere else entirely. Judging a collection that way means scrolling past
 * most of it to see any of it, and the thinking happens on a different screen
 * from the material it is about.
 *
 * So the material is a panel on the left, scrolling on its own, with each
 * category opening and closing. The conversation holds the rest of the space
 * and never moves. You look and you talk in the same place.
 */
export default function ResearchBoard({
  world,
  drop,
  talk: Talk,
}: {
  world: World;
  /** The drop this research is *for* — the one after the one being built. */
  drop: Drop;
  /**
   * The conversation panel. Given as a component rather than an element so
   * the board can hand it the pieces currently on the board — the room has to
   * be able to see what the seller is looking at.
   */
  talk?: React.ComponentType<{
    world: World;
    drop: Drop;
    pins: { id: string; src: string | null }[];
  }>;
}) {
  const [board, setBoard] = useState<Board | null>(null);
  const [later, setLater] = useState<BoardItem[]>([]);
  const [showLater, setShowLater] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  /*
    Which sections are shut, remembered per drop so the board opens the way
    they left it. Kept in the browser rather than the database — it is a view
    preference, not part of the world.
  */
  const [shut, setShut] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`wb-shut-${drop.id}`);
      if (saved) setShut(JSON.parse(saved));
    } catch {
      /* a broken preference is not worth an error */
    }
  }, [drop.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`wb-shut-${drop.id}`, JSON.stringify(shut));
    } catch {
      /* private browsing, quota, and other things that do not matter here */
    }
  }, [shut, drop.id]);
  const [thinking, setThinking] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  const [intent, setIntent] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const b = await openBoard(world, drop);
      setBoard(b);
      setIntent(b.intention);
      setLater(await loadLater(world.id));
    } catch (e) {
      report("board", e, { worldId: world.id, step: "open" });
      setErr(e instanceof Error ? e.message : "Could not open the board.");
    }
  }, [world, drop]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Read anything that has not been read yet, one at a time and quietly.
   * The seller never waits for this — the card is on the board the moment
   * they add it, and the notes arrive underneath a few seconds later.
   */
  useEffect(() => {
    if (!board) return;
    const pending = board.items.find((i) => !i.analyzedAt);
    if (!pending) return;
    let alive = true;
    analyzeItem(pending)
      .then((updated) => {
        if (!alive) return;
        setBoard((b) =>
          b
            ? {
                ...b,
                items: b.items.map((i) => (i.id === updated.id ? updated : i)),
              }
            : b,
        );
      })
      .catch(() => {
        // Mark it seen locally so one unreadable item cannot jam the queue.
        if (!alive) return;
        setBoard((b) =>
          b
            ? {
                ...b,
                items: b.items.map((i) =>
                  i.id === pending.id
                    ? { ...i, analyzedAt: new Date().toISOString() }
                    : i,
                ),
              }
            : b,
        );
      });
    return () => {
      alive = false;
    };
  }, [board]);

  if (err && !board)
    return <p className="t-body px-1 py-8 text-ink-2">{err}</p>;
  if (!board)
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <img src="/globe.png" alt="" className="globe-turn h-10 w-10 opacity-70" />
      </div>
    );

  const onBoard = board.items.filter((i) => !i.later);

  function put(item: BoardItem) {
    setBoard((b) => (b ? { ...b, items: [item, ...b.items] } : b));
  }

  async function pickImages(files: FileList | null) {
    if (!files?.length || !board) return;
    setBusy("Adding…");
    try {
      for (const f of Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      ))
        put(await addImage(world, board.id, f));
    } catch (e) {
      report("board", e, { worldId: world.id, step: "upload" });
      setErr(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function move(item: BoardItem, to: Section | null | "later") {
    const patch =
      to === "later"
        ? { later: true }
        : { section: to, later: false };
    await updateItem(item.id, patch);
    if (to === "later") {
      setBoard((b) =>
        b ? { ...b, items: b.items.filter((i) => i.id !== item.id) } : b,
      );
      setLater((l) => [{ ...item, later: true }, ...l]);
    } else {
      setBoard((b) =>
        b
          ? {
              ...b,
              items: b.items.map((i) =>
                i.id === item.id ? { ...i, section: to, later: false } : i,
              ),
            }
          : b,
      );
    }
  }

  async function pullBack(item: BoardItem) {
    if (!board) return;
    await updateItem(item.id, { later: false, boardId: board.id });
    setLater((l) => l.filter((i) => i.id !== item.id));
    put({ ...item, later: false });
  }

  async function drop_(item: BoardItem) {
    if (!window.confirm("Remove this from the board? This cannot be undone."))
      return;
    await removeItem(item);
    setBoard((b) =>
      b ? { ...b, items: b.items.filter((i) => i.id !== item.id) } : b,
    );
    setLater((l) => l.filter((i) => i.id !== item.id));
  }

  async function look() {
    if (!board) return;
    setThinking(true);
    setErr("");
    try {
      const findings = await findPatterns(board, world);
      setBoard((b) => (b ? { ...b, findings } : b));
      setShowFindings(true);
    } catch (e) {
      report("board", e, { worldId: world.id, step: "patterns" });
      setErr(e instanceof Error ? e.message : "Could not read the board.");
    } finally {
      setThinking(false);
    }
  }

  const byId = new Map(board.items.map((i) => [i.id, i]));

  return (
    <div>
      {/* ------------------------------------------------------ masthead */}
      <header className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[1.9rem] font-extrabold leading-none tracking-tight">
            Drop {String(drop.number).padStart(2, "0")} research
          </h2>
          <span className="t-small text-ink-2">
            building toward {formatDropDate(drop.publishDate)}
          </span>
          {onBoard.length > 0 && (
            <span className="t-small ml-auto text-ink-3">
              {onBoard.length} piece{onBoard.length === 1 ? "" : "s"} collected
            </span>
          )}
        </div>
        <span className="rule-accent mt-3" />
      </header>

      {/* ------------------------------------------------------ intention */}
      {/*
        Lifted out of the left column deliberately. It used to scroll away with
        the images, which is exactly backwards — it is the sentence everything
        below is read through, so it stays in sight above both columns.
      */}
      <div className="mb-5 max-w-3xl">
        {/*
          This is not a title. Whatever is written here is handed to the AI as
          the seller's own statement of intent, so the Creative Room and the
          pattern reading interpret the board through it. The label has to say
          that, or it reads as a name field and gets left blank.
        */}
        <label className="eyebrow mb-1.5 block text-ink-3">
          Tell the AI what you are going for
        </label>
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onBlur={() => setIntention(board.id, intent)}
          placeholder="Optional — e.g. quieter than last week, less pastel, leaning funny"
          className="field"
        />
        <p className="t-small mt-1.5 text-ink-3">
          Not a name for the drop. Whatever you put here changes how everything
          below gets read — leave it blank until you know.
        </p>
      </div>

      {err && <p className="note t-small mb-4 px-4 py-3 text-ink-2">{err}</p>}

      {/*
        Two columns: the material on the left with its own scroll, the
        conversation on the right holding still. On a narrow screen they
        stack, board first, because on a phone you are collecting rather
        than deliberating.
      */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">

      {/* ------------------------------------------------------ add */}
      <AddBar
        busy={busy}
        onImages={() => fileInput.current?.click()}
        onText={async (text) => {
          if (!board) return;
          put(await addText(world, board.id, text));
        }}
        onLink={async (url, note) => {
          if (!board) return;
          try {
            put(await addLink(world, board.id, url, note));
          } catch (e) {
            report("board", e, { worldId: world.id, step: "link" });
      setErr(e instanceof Error ? e.message : "That link did not work.");
          }
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => pickImages(e.target.files)}
        className="hidden"
      />

      {/* ------------------------------------------------------ patterns */}
      {onBoard.length >= 4 && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            onClick={look}
            disabled={thinking}
            className="btn btn-primary"
          >
            {thinking ? "Looking across the board…" : "Show me the patterns"}
          </button>
          {board.findings.length > 0 && !thinking && (
            <button
              onClick={() => setShowFindings((v) => !v)}
              className="t-small underline underline-offset-4 hover:opacity-70"
            >
              {showFindings ? "Back to the board" : `${board.findings.length} found`}
            </button>
          )}
        </div>
      )}

      {showFindings && board.findings.length > 0 && (
        <Findings
          findings={board.findings}
          byId={byId}
          onDismiss={async (id) => {
            await dismissFinding(id);
            setBoard((b) =>
              b ? { ...b, findings: b.findings.filter((f) => f.id !== id) } : b,
            );
          }}
        />
      )}

      {/* ------------------------------------------------------ the board */}
      {onBoard.length === 0 ? (
        <Empty onStart={() => fileInput.current?.click()} number={drop.number} />
      ) : (
        <div className="mt-7 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShut({})}
              className="t-small font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              Open everything
            </button>
            <button
              onClick={() =>
                setShut(Object.fromEntries(SECTIONS.map((s) => [s.id, true])))
              }
              className="t-small font-medium text-ink-3 underline underline-offset-2 transition hover:text-ink"
            >
              Close everything
            </button>
          </div>

          {SECTIONS.map((s) => {
            const items = onBoard.filter(
              (i) => (i.section ?? i.aiSection) === s.id,
            );
            if (!items.length) return null;
            return (
              <Area
                key={s.id}
                title={s.name}
                blurb={s.blurb}
                count={items.length}
                open={!shut[s.id]}
                onToggle={() =>
                  setShut((c) => ({ ...c, [s.id]: !c[s.id] }))
                }
              >
                <Masonry
                  items={items}
                  onMove={move}
                  onRemove={drop_}
                  onNote={async (item, note) => {
                    await updateItem(item.id, { note });
                    setBoard((b) =>
                      b
                        ? {
                            ...b,
                            items: b.items.map((i) =>
                              i.id === item.id ? { ...i, note } : i,
                            ),
                          }
                        : b,
                    );
                  }}
                />
              </Area>
            );
          })}

          {(() => {
            const loose = onBoard.filter((i) => !(i.section ?? i.aiSection));
            if (!loose.length) return null;
            return (
              <Area
                title="Just added"
                blurb="Not sorted anywhere yet, which is fine."
                count={loose.length}
                open={!shut.loose}
                onToggle={() => setShut((c) => ({ ...c, loose: !c.loose }))}
              >
                <Masonry
                  items={loose}
                  onMove={move}
                  onRemove={drop_}
                  onNote={async (item, note) => {
                    await updateItem(item.id, { note });
                  }}
                />
              </Area>
            );
          })()}
        </div>
      )}

      {/* ------------------------------------------------------ later */}
      <div className="mt-10 border-t-2 border-black/10 pt-6">
        <button
          onClick={() => setShowLater((v) => !v)}
          className="flex w-full items-baseline gap-3 text-left"
        >
          <span className="t-h3">Later</span>
          <span className="t-small text-ink-3">
            {later.length
              ? `${later.length} kept for another week`
              : "Good things you are not using yet"}
          </span>
          <span className="ml-auto text-lg leading-none text-ink-3">
            {showLater ? "−" : "+"}
          </span>
        </button>

        {showLater && (
          <div className="rise mt-4">
            <p className="t-small mb-4 max-w-xl text-ink-2">
              This does not empty when the week rolls over. Anything here stays
              with your world until you pull it into a board.
            </p>
            {later.length === 0 ? (
              <p className="t-small text-ink-3">
                Nothing here yet. Send something here when it is good but not
                for this drop.
              </p>
            ) : (
              <Masonry
                items={later}
                onMove={async (item) => pullBack(item)}
                onRemove={drop_}
                pullLabel="Bring into this board"
                onNote={async (item, note) => updateItem(item.id, { note })}
              />
            )}
          </div>
        )}
      </div>

        </div>

        {/*
          The conversation. Given its own height so it behaves like a room you
          are sitting in rather than a box at the bottom of a long page.
        */}
        {Talk && (
          <div className="lg:sticky lg:top-4 lg:h-[calc(100dvh-2rem)]">
            <Talk
              world={world}
              drop={drop}
              pins={onBoard.map((i) => ({ id: i.id, src: i.src }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AddBar({
  busy,
  onImages,
  onText,
  onLink,
}: {
  busy: string;
  onImages: () => void;
  onText: (text: string) => Promise<void>;
  onLink: (url: string, note: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"none" | "text" | "link">("none");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const v = value.trim();
    if (!v || saving) return;
    setSaving(true);
    if (mode === "text") await onText(v);
    else await onLink(v, note.trim());
    setSaving(false);
    setValue("");
    setNote("");
    setMode("none");
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1 text-ink-3">Add to board</span>
        <button onClick={onImages} className="btn btn-accent" disabled={!!busy}>
          {busy || "Image"}
        </button>
        <button
          onClick={() => setMode(mode === "text" ? "none" : "text")}
          className={`btn ${mode === "text" ? "btn-primary" : "btn-ghost"}`}
        >
          Write something
        </button>
        <button
          onClick={() => setMode(mode === "link" ? "none" : "link")}
          className={`btn ${mode === "link" ? "btn-primary" : "btn-ghost"}`}
        >
          Link
        </button>
        <span className="t-small ml-auto hidden text-ink-3 sm:block">
          Throw it in — sorting it out is not your job.
        </span>
      </div>

      {mode !== "none" && (
        <div className="rise mt-3 space-y-2">
          {mode === "text" ? (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
              }}
              rows={3}
              autoFocus
              placeholder="A phrase, a quote, something she said, a joke, half an idea…"
              className="field resize-none"
            />
          ) : (
            <>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                autoFocus
                placeholder="https://…"
                className="field"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
                placeholder="What caught your eye about it? Optional."
                className="field"
              />
            </>
          )}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={!value.trim() || saving}
              className="btn btn-accent"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setMode("none")} className="btn btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A section you can shut.
 *
 * Everything was stacked open, so a board with any weight to it became a long
 * scroll and you could never see the shape of the whole thing at once. The
 * count sits in the header so a closed section still tells you what is inside,
 * and the state is remembered per drop — someone who works mostly in Language
 * should not have to close Colour every time they come back.
 */
function Area({
  title,
  blurb,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-black/12 pt-4">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="group flex w-full items-baseline gap-x-3 text-left"
      >
        <span className="t-h3 text-ink">{title}</span>
        <span className="t-small tabular-nums text-ink-3">{count}</span>
        <span className="t-small hidden text-ink-3 sm:inline">{blurb}</span>
        <span className="ml-auto shrink-0 text-lg leading-none text-ink-3 transition group-hover:text-ink">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

function Masonry({
  items,
  onMove,
  onRemove,
  onNote,
  pullLabel,
}: {
  items: BoardItem[];
  onMove: (item: BoardItem, to: Section | null | "later") => Promise<void>;
  onRemove: (item: BoardItem) => Promise<void>;
  onNote: (item: BoardItem, note: string) => Promise<void>;
  pullLabel?: string;
}) {
  return (
    <div className="columns-2 gap-3 md:columns-3 lg:columns-4 [&>*]:mb-3">
      {items.map((item, i) => (
        <Card
          key={item.id}
          item={item}
          height={IMAGE_HEIGHTS[i % IMAGE_HEIGHTS.length]}
          onMove={onMove}
          onRemove={onRemove}
          onNote={onNote}
          pullLabel={pullLabel}
        />
      ))}
    </div>
  );
}

function Card({
  item,
  height,
  onMove,
  onRemove,
  onNote,
  pullLabel,
}: {
  item: BoardItem;
  height: string;
  onMove: (item: BoardItem, to: Section | null | "later") => Promise<void>;
  onRemove: (item: BoardItem) => Promise<void>;
  onNote: (item: BoardItem, note: string) => Promise<void>;
  pullLabel?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);

  const when = new Date(item.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="card card-hover break-inside-avoid overflow-hidden">
      {item.kind === "image" && item.src && (
        <img
          src={item.src}
          alt=""
          loading="lazy"
          className={`w-full ${height} border-b-2 border-black object-cover`}
        />
      )}

      <div className="p-3">
        {item.kind === "text" && (
          <p className="t-body font-semibold leading-snug text-ink">
            {item.body}
          </p>
        )}

        {item.kind === "link" && (
          <>
            <a
              href={item.sourceUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="t-small font-bold underline underline-offset-2"
            >
              {item.sourceLabel} ↗
            </a>
            {item.note && (
              <p className="t-small mt-1 text-ink-2">{item.note}</p>
            )}
          </>
        )}

        {item.kind === "image" && item.note && !editing && (
          <p className="t-small text-ink-2">{item.note}</p>
        )}

        {editing && (
          <div className="mt-1 flex gap-1.5">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                onNote(item, note);
                setEditing(false);
              }}
              autoFocus
              placeholder="A note to yourself"
              className="field !py-1.5 text-[13px]"
            />
            <button
              onClick={() => {
                onNote(item, note);
                setEditing(false);
              }}
              className="btn btn-ghost !px-2 !py-1 text-[12px]"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-3">{when}</span>
          <button
            onClick={() => setMenu((v) => !v)}
            className="text-[13px] leading-none text-ink-3 transition hover:text-ink"
            aria-label="Move or remove"
          >
            •••
          </button>
        </div>

        {menu && (
          <div className="rise mt-2 border-t border-black/10 pt-2">
            {pullLabel ? (
              <button
                onClick={() => {
                  onMove(item, null);
                  setMenu(false);
                }}
                className="block w-full py-1 text-left text-[13px] font-semibold hover:opacity-70"
              >
                {pullLabel}
              </button>
            ) : (
              <>
                <p className="eyebrow mb-1 text-ink-3">Move to</p>
                {SECTIONS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      onMove(item, s.id);
                      setMenu(false);
                    }}
                    className="block w-full py-1 text-left text-[13px] hover:opacity-70"
                  >
                    {SECTION_NAME[s.id]}
                  </button>
                ))}
                <button
                  onClick={() => {
                    onMove(item, "later");
                    setMenu(false);
                  }}
                  className="block w-full py-1 text-left text-[13px] font-semibold hover:opacity-70"
                >
                  Later
                </button>
              </>
            )}
            {item.kind !== "text" && (
              <button
                onClick={() => {
                  setEditing(true);
                  setMenu(false);
                }}
                className="block w-full py-1 text-left text-[13px] hover:opacity-70"
              >
                {item.note ? "Edit note" : "Add a note"}
              </button>
            )}
            <button
              onClick={() => {
                onRemove(item);
                setMenu(false);
              }}
              className="block w-full py-1 text-left text-[13px] text-ink-3 hover:text-ink"
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Findings({
  findings,
  byId,
  onDismiss,
}: {
  findings: Finding[];
  byId: Map<string, BoardItem>;
  onDismiss: (id: string) => Promise<void>;
}) {
  return (
    <div className="rise mt-6 space-y-4">
      {findings.map((f, i) => {
        const evidence = f.itemIds
          .map((id) => byId.get(id))
          .filter(Boolean) as BoardItem[];
        return (
          <section key={f.id} className="card p-5">
            <div className="flex items-center gap-2">
              {f.kind === "collision" ? (
                <Star size={10} className="text-accent" />
              ) : (
                <Dots />
              )}
              <span className="eyebrow text-ink-3">
                {f.kind === "collision" ? "Possible collision" : `Pattern ${String(i + 1).padStart(2, "0")}`}
              </span>
              <button
                onClick={() => onDismiss(f.id)}
                className="ml-auto text-[12px] text-ink-3 transition hover:text-ink"
              >
                Dismiss
              </button>
            </div>

            <h3 className="t-h2 mt-3 text-ink">{f.title}</h3>
            <p className="t-body mt-1.5 text-ink-2">{f.detail}</p>

            {/* The evidence. An observation you cannot trace is just flattery. */}
            {evidence.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {evidence.map((item) =>
                  item.kind === "image" && item.src ? (
                    <img
                      key={item.id}
                      src={item.src}
                      alt=""
                      loading="lazy"
                      className="h-24 w-24 rounded-lg border-2 border-black object-cover"
                    />
                  ) : (
                    <span
                      key={item.id}
                      className="max-w-[15rem] rounded-lg border-2 border-black bg-white px-3 py-2 text-[12.5px] font-medium leading-snug"
                    >
                      {item.body || item.note || item.sourceLabel}
                    </span>
                  ),
                )}
              </div>
            )}
          </section>
        );
      })}

      <p className="t-small text-ink-3">
        These are things you saved, put next to each other. What any of it is
        worth is your call — nothing here is a suggestion about what to make.
      </p>
    </div>
  );
}

function Empty({ onStart, number }: { onStart: () => void; number: number }) {
  return (
    <div className="mt-7 rounded-xl border-2 border-dashed border-black/25 px-6 py-14 text-center">
      <p className="t-h2">Drop {String(number).padStart(2, "0")} starts here.</p>
      <p className="t-body mx-auto mt-3 max-w-md text-ink-2">
        Anything that catches your attention this week goes here. A layout you
        liked. A colour pairing. Something she said. Half an idea you would
        otherwise lose in your camera roll.
      </p>
      <p className="t-small mx-auto mt-3 max-w-md text-ink-3">
        No pressure to organise it. The patterns show up as the week builds.
      </p>
      <button onClick={onStart} className="btn btn-accent mt-6">
        Add your first piece
      </button>
    </div>
  );
}
