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
  setLane,
  dragLane,
  pullNewPins,
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
import Link from "next/link";
import SplitPane from "./SplitPane";
import SortPass from "./SortPass";
import Capture from "./Capture";
import Said from "./Said";
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

/**
 * The lanes across the board, left to right. Design leads because the seller
 * is looking before she is reading; Quotes second because the words are what
 * actually go on the shirt; Structures and Colour are the quieter reads.
 * "Just added" sits on the end and only exists while something is in it.
 */
const LANES: { id: Section | "loose"; name: string }[] = [
  ...SECTIONS.map((s) => ({ id: s.id as Section | "loose", name: s.name })),
  { id: "loose", name: "Just added" },
];

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
  /* What is currently in the seller's hand, and which lane it came out of. */
  const [held, setHeld] = useState<{
    item: BoardItem;
    from: Section | null;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [sorting, setSorting] = useState(false);
  /* Which lane the wall is narrowed to. null means show everything. */
  const [only, setOnly] = useState<Section | "unfiled" | null>(null);
  const [pulling, setPulling] = useState(false);
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
  const unfiled = onBoard.filter((i) => i.sections.length === 0);
  const shown =
    only === null
      ? onBoard
      : only === "unfiled"
        ? unfiled
        : onBoard.filter((i) => i.sections.includes(only));

  function put(item: BoardItem) {
    setBoard((b) => (b ? { ...b, items: [item, ...b.items] } : b));
  }

  async function pickImages(files: FileList | File[] | null) {
    if (!files || !board) return;
    const list = Array.from(files);
    if (!list.length) return;
    setBusy("Adding…");
    try {
      for (const f of list.filter((f) => f.type.startsWith("image/")))
        put(await addImage(world, board.id, f));
    } catch (e) {
      report("board", e, { worldId: world.id, step: "upload" });
      setErr(e instanceof Error ? e.message : "That upload failed.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  /** Put a piece aside, or bring it back onto the board. */
  async function shelve(item: BoardItem) {
    await updateItem(item.id, { later: true });
    setBoard((b) =>
      b ? { ...b, items: b.items.filter((i) => i.id !== item.id) } : b,
    );
    setLater((l) => [{ ...item, later: true }, ...l]);
  }

  /** Add or remove one lane without disturbing the others. */
  async function lane(item: BoardItem, which: Section, member: boolean) {
    const next = await setLane(item, which, member);
    setBoard((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) =>
              i.id === item.id ? { ...i, sections: next } : i,
            ),
          }
        : b,
    );
  }

  /** Dragged out of one lane and into another. */
  async function drag(item: BoardItem, from: Section | null, to: Section) {
    if (from === to) return;
    const next = await dragLane(item, from, to);
    setBoard((b) =>
      b
        ? {
            ...b,
            items: b.items.map((i) =>
              i.id === item.id ? { ...i, sections: next } : i,
            ),
          }
        : b,
    );
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
      {/*
        One line. It used to carry a label above and two lines of explanation
        below, which is three rows of furniture around a field most people
        leave blank. The placeholder says everything the paragraph did.
      */}
      <div className="mb-5 max-w-2xl">
        {/*
          A full bordered field, empty, was the largest object on a page whose
          subject is images. It is an optional sentence, so it looks like a
          sentence — a line you write on, not a box you must fill.
        */}
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onBlur={() => setIntention(board.id, intent)}
          placeholder="What are you going for this week?"
          title="Whatever you write here is how the AI reads the whole board"
          className="w-full border-0 border-b border-black/15 bg-transparent px-0 py-1.5 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-black"
        />
      </div>

      {err && <p className="note t-small mb-4 px-4 py-3 text-ink-2">{err}</p>}

      {sorting && (
        <SortPass
          items={onBoard.filter((i) => i.sections.length === 0)}
          onDone={() => setSorting(false)}
          onSorted={(id, sections) =>
            setBoard((b) =>
              b
                ? {
                    ...b,
                    items: b.items.map((i) =>
                      i.id === id ? { ...i, sections } : i,
                    ),
                  }
                : b,
            )
          }
        />
      )}

      {/*
        CHAT LEFT, MATERIAL RIGHT.
        
        This is the layout ChatGPT Canvas and Lovable landed on, and the reason
        is the reading order: a left-hand conversation is the first thing the
        eye hits on the F-shaped scan, which frames the AI as a partner you are
        working *with* rather than a helper bolted onto the side. The material
        then gets the whole rest of the page, which is what it needs — images
        judged four-across in a 520px rail were being judged as thumbnails.

        The divider is draggable and the size is remembered, because how much
        room a conversation deserves depends on whether you are talking or
        looking, and that changes hour to hour.
      */}
      {/*
        THE BOARD IS THE PAGE.

        The conversation sat on the left at a third of the width, which put a
        text panel where the eye lands first on a screen whose subject is
        images — and squeezed the images into what was left. It is a rail on
        the right now: reachable the whole time, never the main event, and it
        folds to a spine when you want the whole width to look.
      */}
      <SplitPane
        storageKey="wb-research-split"
        collapsedLabel="chat"
        collapse="right"
        initial={0.76}
        min={0.6}
        max={0.85}
        left={
          <div className="pb-8">

      {/*
        ONE WALL, FILTERED.

        The lanes were four columns side by side, which meant four headings,
        four counts, four fold controls and a row of board-wide buttons above
        them — before a single image. The lanes are still real; they are just
        a filter now rather than a layout, which is a control every person
        alive already understands.

        Everything you can do to the whole board lives on one line, and most
        of it only appears when it applies.
      */}
      <Capture
        busy={busy}
        onText={async (text) => {
          if (!board) return;
          put(await addText(world, board.id, text));
        }}
        onLink={async (url) => {
          if (!board) return;
          try {
            put(await addLink(world, board.id, url, ""));
          } catch (e) {
            report("board", e, { worldId: world.id, step: "link" });
            setErr(e instanceof Error ? e.message : "That link did not work.");
          }
        }}
        onFiles={pickImages}
      />

      {onBoard.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Pill on={only === null} onClick={() => setOnly(null)}>
            Everything <Count n={onBoard.length} on={only === null} />
          </Pill>
          {SECTIONS.map((sec) => {
            const n = onBoard.filter((i) => i.sections.includes(sec.id)).length;
            if (!n && only !== sec.id) return null;
            return (
              <Pill
                key={sec.id}
                on={only === sec.id}
                onClick={() => setOnly(only === sec.id ? null : sec.id)}
              >
                {sec.name} <Count n={n} on={only === sec.id} />
              </Pill>
            );
          })}
          {unfiled.length > 0 && (
            <Pill on={only === "unfiled"} onClick={() => setOnly("unfiled")}>
              Unfiled <Count n={unfiled.length} on={only === "unfiled"} />
            </Pill>
          )}

          <span className="ml-auto flex items-center gap-3">
            {/*
              The refresh lives here because this is where a seller notices
              her research has gone stale. The alternative was a trip to World
              Profile to re-import each board one at a time.
            */}
            <button
              onClick={async () => {
                setPulling(true);
                setErr("");
                try {
                  const r = await pullNewPins(world.id, drop.id);
                  if (r.imported > 0) await load();
                  else
                    setErr(
                      r.note ??
                        "Nothing new on your Pinterest boards since last time.",
                    );
                } catch (e) {
                  setErr(
                    e instanceof Error
                      ? e.message
                      : "That refresh did not finish.",
                  );
                } finally {
                  setPulling(false);
                }
              }}
              disabled={pulling}
              title="Pull the 20 most recent pins from the boards feeding this drop"
              className="t-small text-ink-3 underline underline-offset-4 transition hover:text-ink disabled:opacity-50"
            >
              {pulling ? "Checking Pinterest…" : "Refresh from Pinterest"}
            </button>

            {unfiled.length > 0 && (
              <button
                onClick={() => setSorting(true)}
                className="t-small font-semibold text-ink underline underline-offset-4 transition hover:text-accent-ink"
              >
                Sort {unfiled.length}
              </button>
            )}
            {/*
              Read once, then open and shut. Findings rendering by default put
              six paragraphs of prose above the images — on a page whose whole
              job is showing you what you saved.
            */}
            {onBoard.length >= 4 && (
              <button
                onClick={() =>
                  board.findings.length ? setShowFindings((v) => !v) : look()
                }
                disabled={thinking}
                className="t-small font-semibold text-accent-ink underline underline-offset-4 transition hover:text-ink disabled:opacity-50"
              >
                {thinking
                  ? "Looking…"
                  : !board.findings.length
                    ? "Find the patterns"
                    : showFindings
                      ? "Hide patterns"
                      : `${board.findings.length} patterns`}
              </button>
            )}
          </span>
        </div>
      )}

      {showFindings && board.findings.length > 0 && !thinking && (
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

      {onBoard.length === 0 ? (
        <Empty number={drop.number} />
      ) : (
        <div className="mt-4 columns-2 gap-3 sm:columns-3 xl:columns-4 2xl:columns-5 [&>*]:mb-3">
          {shown.map((item) => (
            <div key={item.id} className="break-inside-avoid">
              <Piece
                item={item}
                lane={only === "unfiled" || only === null ? null : only}
                onLane={lane}
                onShelve={shelve}
                onRemove={drop_}
                onGrab={() => {}}
                onNote={async (it, note) => {
                  await updateItem(it.id, { note });
                  setBoard((b) =>
                    b
                      ? {
                          ...b,
                          items: b.items.map((i) =>
                            i.id === it.id ? { ...i, note } : i,
                          ),
                        }
                      : b,
                  );
                }}
              />
            </div>
          ))}
          {shown.length === 0 && (
            <p className="t-small text-ink-3">Nothing in here yet.</p>
          )}
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
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-6">
                {later.map((item) => (
                  <div key={item.id} className="space-y-1">
                    <Piece
                      item={item}
                      lane={null}
                      onLane={async () => {}}
                      onShelve={async () => pullBack(item)}
                      onRemove={drop_}
                      onGrab={() => {}}
                      onNote={async (it, note) => updateItem(it.id, { note })}
                    />
                    <button
                      onClick={() => pullBack(item)}
                      className="t-small text-ink-3 underline underline-offset-2 transition hover:text-ink"
                    >
                      Bring in
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

          </div>
        }
        right={
          Talk ? (
            <div className="sticky top-4 h-[calc(100dvh-2rem)]">
              <Talk
                world={world}
                drop={drop}
                pins={onBoard.map((i) => ({ id: i.id, src: i.src }))}
              />
            </div>
          ) : null
        }
      />
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

  /*
    This was a black-bordered card holding a pink button, sitting directly
    above a black-bordered board holding a black button — the two loudest
    things on the page were the furniture, not the work. Adding to a board is
    a small, frequent, unremarkable act. It gets a quiet strip.
  */
  const chip =
    "rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-[13px] font-medium text-ink-2 transition hover:border-black hover:text-ink";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-small mr-1 text-ink-3">Add</span>
        <button onClick={onImages} className={chip} disabled={!!busy}>
          {busy || "Image"}
        </button>
        <button
          onClick={() => setMode(mode === "text" ? "none" : "text")}
          className={`${chip} ${mode === "text" ? "!border-black !text-ink" : ""}`}
        >
          Words
        </button>
        <button
          onClick={() => setMode(mode === "link" ? "none" : "link")}
          className={`${chip} ${mode === "link" ? "!border-black !text-ink" : ""}`}
        >
          Link
        </button>
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
/**
 * A PIECE ON THE BOARD.
 *
 * The old card wore the house style: 2px black border, hard offset shadow,
 * hover lift. Correct for a button, ruinous for thirty images — every piece
 * shouted at exactly the volume of every other piece, so nothing receded and
 * the board read as noise.
 *
 * Here the image is the object and everything else waits to be asked for. No
 * border on the picture, a four-word caption, and the controls only appear
 * under the cursor.
 */
/** A filter pill. The whole lane vocabulary reduced to one control. */
function Pill({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition ${
        on
          ? "border-black bg-black text-white"
          : "border-black/15 bg-white text-ink-2 hover:border-black hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Count({ n, on }: { n: number; on: boolean }) {
  return (
    <span className={`tabular-nums ${on ? "opacity-55" : "text-ink-3"}`}>
      {n}
    </span>
  );
}

function Piece({
  item,
  lane,
  onLane,
  onShelve,
  onRemove,
  onNote,
  onGrab,
}: {
  item: BoardItem;
  /** The lane this copy of the piece is sitting in; null in the unsorted tray. */
  lane: Section | null;
  onLane: (item: BoardItem, which: Section, member: boolean) => Promise<void>;
  onShelve: (item: BoardItem) => Promise<void>;
  onRemove: (item: BoardItem) => Promise<void>;
  onNote: (item: BoardItem, note: string) => Promise<void>;
  onGrab: (item: BoardItem, from: Section | null) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);

  return (
    <div
      draggable
      onDragStart={(e) => {
        onGrab(item, lane);
        e.dataTransfer.effectAllowed = "move";
        // Firefox refuses to start a drag without payload on the event.
        e.dataTransfer.setData("text/plain", item.id);
      }}
      className="group/piece relative cursor-grab active:cursor-grabbing"
    >
      {item.kind === "image" && item.src && (
        <img
          src={item.src}
          alt=""
          loading="lazy"
          draggable={false}
          className="w-full rounded-lg border border-black/8 object-cover"
        />
      )}

      {item.kind === "text" && (
        <p className="rounded-lg border-l-2 border-black/25 bg-white/70 py-1.5 pl-2.5 pr-2 text-[13px] font-medium leading-snug text-ink">
          {item.body}
        </p>
      )}

      {item.kind === "link" && (
        <a
          href={item.sourceUrl ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          className="t-small block font-semibold text-ink underline decoration-black/20 underline-offset-2 hover:decoration-black"
        >
          {item.sourceLabel} ↗
        </a>
      )}

      {item.note && !editing && <Caption text={item.note} />}

      {/*
        A piece in more than one lane says so, quietly, and only in the lanes
        it is not currently sitting in. Otherwise every card carries a label
        repeating the column heading directly above it.
      */}
      {item.sections.length > 1 && (
        <p className="mt-0.5 text-[10.5px] text-ink-3">
          also in{" "}
          {item.sections
            .filter((x) => x !== lane)
            .map((x) => SECTION_NAME[x].toLowerCase())
            .join(", ")}
        </p>
      )}

      {editing && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            onNote(item, note);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            onNote(item, note);
            setEditing(false);
          }}
          autoFocus
          placeholder="A note to yourself"
          className="mt-1 w-full rounded-md border border-black/15 bg-white px-2 py-1 text-[12px] outline-none focus:border-black"
        />
      )}

      <button
        onClick={() => setMenu((v) => !v)}
        aria-label="Lanes, note or remove"
        className={`absolute right-1 top-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[12px] leading-none text-ink-2 shadow-sm transition ${
          menu ? "" : "opacity-0 group-hover/piece:opacity-100"
        }`}
      >
        •••
      </button>

      {menu && (
        <div className="rise absolute right-1 top-7 z-20 w-44 rounded-lg border border-black/15 bg-white p-1.5 shadow-lg">
          {/*
            Checkboxes, not a destination list. The old menu said "move to",
            which forced the seller to name the one reason that counted for a
            pin she may well have saved for three.
          */}
          <p className="eyebrow px-1.5 pb-1 text-ink-3">Saved for</p>
          {SECTIONS.map((sec) => {
            const on = item.sections.includes(sec.id);
            return (
              <button
                key={sec.id}
                onClick={() => onLane(item, sec.id, !on)}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] hover:bg-black/5"
              >
                <span
                  className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
                    on
                      ? "border-black bg-black text-white"
                      : "border-black/25 text-transparent"
                  }`}
                >
                  ✓
                </span>
                {sec.name}
                {!on && item.aiSection === sec.id && (
                  <span
                    title="What the AI would have guessed"
                    className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"
                  />
                )}
              </button>
            );
          })}
          <span className="my-1 block h-px bg-black/10" />
          <button
            onClick={() => {
              onShelve(item);
              setMenu(false);
            }}
            className="block w-full rounded px-1.5 py-1 text-left text-[13px] hover:bg-black/5"
          >
            Keep for later
          </button>
          {item.kind !== "text" && (
            <button
              onClick={() => {
                setEditing(true);
                setMenu(false);
              }}
              className="block w-full rounded px-1.5 py-1 text-left text-[13px] hover:bg-black/5"
            >
              {item.note ? "Edit note" : "Add a note"}
            </button>
          )}
          <button
            onClick={() => {
              onRemove(item);
              setMenu(false);
            }}
            className="block w-full rounded px-1.5 py-1 text-left text-[13px] text-ink-3 hover:bg-black/5 hover:text-ink"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
function Caption({ text }: { text: string }) {
  const [full, setFull] = useState(false);
  const words = text.trim().split(/\s+/);
  const long = words.length > 4;
  if (!text.trim()) return null;

  return (
    <button
      onClick={() => long && setFull((v) => !v)}
      title={long && !full ? text : undefined}
      className={`mt-1 block w-full text-left text-[11.5px] leading-snug text-ink-3 ${
        long ? "cursor-pointer hover:text-ink-2" : "cursor-default"
      }`}
    >
      {full || !long ? text : `${words.slice(0, 4).join(" ")}…`}
    </button>
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

            <h3 className="t-h2 mt-3 text-ink">
              <Said text={f.title} />
            </h3>
            <p className="t-body mt-1.5 text-ink-2">
              <Said text={f.detail} />
            </p>

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

function Empty({ number }: { number: number }) {
  /*
    An empty board used to be a dashed box with a button, which looked exactly
    like the old design and gave a seller no way to tell a fresh world from a
    broken one. It now says where things come from, because on an empty board
    the answer to "what do I do" is on the Pinterest screen, not here.
  */
  return (
    <div className="mt-5 rounded-xl border border-black/12 bg-white/70 px-6 py-12 text-center">
      <p className="t-h2">Drop {String(number).padStart(2, "0")} starts here.</p>
      <p className="t-body mx-auto mt-3 max-w-md text-ink-2">
        Paste a link or a phrase in the field above, drop an image on it, or
        bring in a Pinterest board and everything lands here at once.
      </p>
      <p className="t-small mx-auto mt-4 max-w-md text-ink-3">
        Two lanes: <b className="text-ink-2">Design inspo</b> for anything you
        saved because you liked it, <b className="text-ink-2">Etsy bestsellers</b>{" "}
        for what is already selling.
      </p>
      <Link href="/profile#pinterest" className="btn btn-ghost mt-6">
        Bring in a Pinterest board
      </Link>
    </div>
  );
}
