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
import SplitPane from "./SplitPane";
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
      {/*
        One line. It used to carry a label above and two lines of explanation
        below, which is three rows of furniture around a field most people
        leave blank. The placeholder says everything the paragraph did.
      */}
      <div className="mb-5 max-w-3xl">
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onBlur={() => setIntention(board.id, intent)}
          placeholder="What are you going for? e.g. quieter than last week, less pastel, leaning funny — the AI reads the whole board through this"
          className="field"
        />
      </div>

      {err && <p className="note t-small mb-4 px-4 py-3 text-ink-2">{err}</p>}

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
      <SplitPane
        storageKey="wb-research-split"
        collapsedLabel="conversation"
        left={
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
        right={
          <div className="pb-8">

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
        <div className="mt-6 space-y-3">
          {/*
            Everything that acts on the whole board lives on one line: the
            pattern read on the left where it reads as the main move, the
            open/close pair pushed to the right where they belong with the
            sections they operate on. These were three separate rows.
          */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/12 pb-3">
            {onBoard.length >= 4 && (
              <>
                <button
                  onClick={look}
                  disabled={thinking}
                  className="btn btn-primary"
                >
                  {thinking ? "Looking…" : "Show me the patterns"}
                </button>
                {board.findings.length > 0 && !thinking && (
                  <button
                    onClick={() => setShowFindings((v) => !v)}
                    className="t-small underline underline-offset-4 hover:opacity-70"
                  >
                    {showFindings
                      ? "Back to the board"
                      : `${board.findings.length} found`}
                  </button>
                )}
              </>
            )}
            <span className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setShut({})}
                className="t-small text-ink-3 underline underline-offset-2 transition hover:text-ink"
              >
                Open all
              </button>
              <button
                onClick={() =>
                  setShut(Object.fromEntries(SECTIONS.map((s) => [s.id, true])))
                }
                className="t-small text-ink-3 underline underline-offset-2 transition hover:text-ink"
              >
                Close all
              </button>
            </span>
          </div>

          {/*
            ONE BOARD, FOUR LANES.

            These used to be four stacked sections, each with its own masonry
            grid, which is why the page felt like four things instead of one.
            A collection sorted four ways should look like a collection sorted
            four ways — connected, side by side, told apart by a half-shade of
            warmth rather than by four black boxes competing for attention.

            A lane you are not working in folds to a spine. Nothing is deleted,
            nothing is hidden down a scroll; it is just out of the way.
          */}
          <div className="card overflow-hidden">
            <div className="flex items-stretch">
              {LANES.map((s, index) => {
                const items =
                  s.id === "loose"
                    ? onBoard.filter((i) => !(i.section ?? i.aiSection))
                    : onBoard.filter(
                        (i) => (i.section ?? i.aiSection) === s.id,
                      );
                // An empty optional lane is furniture. Only "just added"
                // earns its place while empty, and only when it has something.
                if (!items.length && s.id === "loose") return null;
                const open = !shut[s.id];

                if (!open)
                  return (
                    <button
                      key={s.id}
                      onClick={() => setShut((c) => ({ ...c, [s.id]: false }))}
                      title={`Open ${s.name}`}
                      className={`lane lane-${index % 4} flex w-11 shrink-0 flex-col items-center gap-3 py-4 transition hover:bg-white`}
                    >
                      <span className="t-small tabular-nums text-ink-3">
                        {items.length}
                      </span>
                      <span
                        className="text-[12px] font-semibold tracking-tight text-ink-2"
                        style={{ writingMode: "vertical-rl" }}
                      >
                        {s.name}
                      </span>
                    </button>
                  );

                return (
                  <div
                    key={s.id}
                    className={`lane lane-${index % 4} min-w-0 flex-1`}
                  >
                    <button
                      onClick={() => setShut((c) => ({ ...c, [s.id]: true }))}
                      title={`Fold ${s.name} away`}
                      className="group flex w-full items-center gap-2 px-3 py-2.5 text-left"
                    >
                      <span className="text-[13px] font-semibold tracking-tight text-ink">
                        {s.name}
                      </span>
                      <span className="t-small tabular-nums text-ink-3">
                        {items.length}
                      </span>
                      <span className="ml-auto text-[11px] leading-none text-transparent transition group-hover:text-ink-3">
                        fold
                      </span>
                    </button>

                    <div className="space-y-2 px-2 pb-3">
                      {items.length === 0 ? (
                        <p className="t-small px-1 py-2 text-ink-3">
                          Nothing here yet.
                        </p>
                      ) : (
                        items.map((item) => (
                          <Piece
                            key={item.id}
                            item={item}
                            onMove={move}
                            onRemove={drop_}
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
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
                      onMove={async (it) => pullBack(it)}
                      onRemove={drop_}
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
          Sorting it out is not your job.
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
function Piece({
  item,
  onMove,
  onRemove,
  onNote,
}: {
  item: BoardItem;
  onMove: (item: BoardItem, to: Section | null | "later") => Promise<void>;
  onRemove: (item: BoardItem) => Promise<void>;
  onNote: (item: BoardItem, note: string) => Promise<void>;
}) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note);

  return (
    <div className="group/piece relative">
      {item.kind === "image" && item.src && (
        <img
          src={item.src}
          alt=""
          loading="lazy"
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
          className="t-small block font-semibold text-ink underline decoration-black/20 underline-offset-2 hover:decoration-black"
        >
          {item.sourceLabel} ↗
        </a>
      )}

      {item.note && !editing && <Caption text={item.note} />}

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

      {/*
        One control, and it stays invisible until you are actually pointing at
        the piece. A ••• on every card is thirty pieces of chrome asking to be
        read before you have looked at a single image.
      */}
      <button
        onClick={() => setMenu((v) => !v)}
        aria-label="Move, note or remove"
        className={`absolute right-1 top-1 rounded-md bg-white/90 px-1.5 py-0.5 text-[12px] leading-none text-ink-2 shadow-sm transition ${
          menu ? "" : "opacity-0 group-hover/piece:opacity-100"
        }`}
      >
        •••
      </button>

      {menu && (
        <div className="rise absolute right-1 top-7 z-10 w-40 rounded-lg border border-black/15 bg-white p-1.5 shadow-lg">
          <p className="eyebrow px-1.5 pb-1 text-ink-3">Move to</p>
          {SECTIONS.filter((sec) => sec.id !== (item.section ?? item.aiSection)).map(
            (sec) => (
              <button
                key={sec.id}
                onClick={() => {
                  onMove(item, sec.id);
                  setMenu(false);
                }}
                className="block w-full rounded px-1.5 py-1 text-left text-[13px] hover:bg-black/5"
              >
                {sec.name}
              </button>
            ),
          )}
          <span className="my-1 block h-px bg-black/10" />
          <button
            onClick={() => {
              onMove(item, "later");
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
