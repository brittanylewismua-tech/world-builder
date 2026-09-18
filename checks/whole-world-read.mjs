/* Every check runs the SHIPPED text of pickAcrossWorld, cut out of the route
   file rather than retyped, so this cannot drift from what deploys. */
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/app/api/winners/read/route.ts", import.meta.url), "utf8");
const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
let body = cut("const bySales =", "export async function POST");
body = body
  .replace(/export interface WorldPick \{[\s\S]*?\n\}/, "")
  .replace(/: Row\[\]\): WorldPick/g, ")").replace(/: Row\[\]/g, "")
  .replace(/: Row/g, "").replace(/<string, Row\[\]>/g, "")
  .replace(/<string>/g, "").replace(/const best: Row\[\] = \[\]/, "const best = []");
const LOOK_AT = Number((src.match(/const LOOK_AT = (\d+)/) || [])[1]);
const fn = new Function("LOOK_AT", `${body}; return pickAcrossWorld;`)(LOOK_AT);

const d = (keyword, id, sales, image = "img") =>
  ({ keyword, listing_id: id, sales, image_url: image });
const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

/* 1 — fewer than 10 keywords: every populated keyword included */
for (const n of [1, 2, 4, 7, 9]) {
  const rows = [];
  let id = 0;
  for (let k = 0; k < n; k += 1)
    for (let j = 0; j < 4; j += 1) rows.push(d(`kw${k}`, `L${id++}`, 100 - k * 10 + j));
  const out = fn(rows);
  const corners = new Set(out.chosen.map(r => r.keyword));
  check(`1 · ${n} keywords → every one represented`,
    corners.size === n && out.keywords === n && out.keywordsLeftOut === 0,
    { corners: corners.size, of: n, chosen: out.chosen.length });
}

/* 2 — more than 10 keywords: defined as the ten strongest corners, and said so */
{
  const rows = Array.from({ length: 14 }, (_, k) => d(`kw${k}`, `M${k}`, 200 - k));
  const out = fn(rows);
  const corners = [...new Set(out.chosen.map(r => r.keyword))];
  check("2 · 14 keywords → the 10 strongest corners, remainder reported",
    out.chosen.length === LOOK_AT && corners.length === LOOK_AT
      && out.keywordsLeftOut === 4 && out.keywordsPopulated === 14
      && corners.every((_, i) => corners[i] === `kw${i}`),
    { chosen: out.chosen.length, leftOut: out.keywordsLeftOut, order: corners.slice(0, 3) });
}

/* 3 — one strong keyword cannot crowd out the others */
{
  const rows = [
    ...Array.from({ length: 30 }, (_, n) => d("strong", `S${n}`, 5000 - n)),
    ...Array.from({ length: 9 }, (_, k) => d(`weak${k}`, `W${k}`, 1)),
  ];
  const out = fn(rows);
  check("3 · a dominant corner takes exactly one slot",
    out.chosen.filter(r => r.keyword === "strong").length === 1
      && new Set(out.chosen.map(r => r.keyword)).size === 10,
    { fromStrong: out.chosen.filter(r => r.keyword === "strong").length,
      corners: new Set(out.chosen.map(r => r.keyword)).size });
}

/* 4 — an empty keyword does not fail the read */
{
  const rows = [
    ...Array.from({ length: 5 }, (_, k) => d(`has${k}`, `H${k}`, 50 - k)),
    d("noimage", "N1", 999, ""),            // present but unusable
  ];
  const out = fn(rows);
  check("4 · a keyword with no usable design is skipped, not fatal",
    out.chosen.length === 5 && !out.chosen.some(r => r.keyword === "noimage")
      && out.keywordsPopulated === 5,
    { chosen: out.chosen.length, populated: out.keywordsPopulated });
  /* and a completely empty world returns nothing rather than throwing */
  const empty = fn([]);
  check("4b · an empty world returns an empty pick rather than throwing",
    empty.chosen.length === 0 && empty.keywords === 0, empty);
}

/* 5 — the same design under several keywords is sent once */
{
  const shared = "DUPE";
  const rows = [
    d("feminist", shared, 900),
    d("feminist shirt", shared, 900),
    d("feminist tee", shared, 900),
    d("feminist shirt", "B1", 800),
    d("feminist tee", "B2", 700),
    d("other", "C1", 600),
  ];
  const out = fn(rows);
  const ids = out.chosen.map(r => r.listing_id);
  check("5 · a design under three keywords appears once",
    ids.filter(x => x === shared).length === 1
      && new Set(ids).size === ids.length,
    { ids, timesShared: ids.filter(x => x === shared).length });
  /* the corners that lost it fall through to their own next best */
  check("5b · corners that lost it still get their own design",
    out.chosen.some(r => r.listing_id === "B1")
      && out.chosen.some(r => r.listing_id === "B2"),
    { ids });
}

/* 6 — deterministic for identical saved data, whatever order rows arrive in */
{
  const base = [];
  let id = 0;
  for (let k = 0; k < 6; k += 1)
    for (let j = 0; j < 5; j += 1) base.push(d(`kw${k}`, `D${id++}`, 100));  // all ties
  const shuffle = (a, seed) => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i -= 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const j = seed % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const runs = [1, 2, 3, 4, 5].map(s =>
    fn(shuffle(base, s)).chosen.map(r => r.listing_id).join(","));
  check("6 · identical data picks identically across 5 row orderings (all sales tied)",
    new Set(runs).size === 1, { distinctResults: new Set(runs).size, first: runs[0] });
}

/* ---------------------------------------------- the route-level guarantees */
/* These read the route's own text: what they check is structure, not output. */
const limits = readFileSync(new URL("../src/lib/limits.ts", import.meta.url), "utf8");
const MOST_KEYWORDS = Number((limits.match(/MOST_KEYWORDS = (\d+)/) || [])[1]);
const worldCap = Number((limits.match(/world: (\d+)/) || [])[1]);

check("7 · the brief reports what it rested on",
  /support,/.test(src) && /keywordsPopulated/.test(src) && /keywordsLeftOut/.test(src),
  { support: /support,/.test(src) });

check("8a · the world read has its own weekly allowance, separate from a keyword read",
  worldCap > 0 && /WEEKLY/.test(readFileSync(new URL("../src/lib/guard.ts", import.meta.url), "utf8"))
    && /admit\(req, wholeWorld \? "world" : "winners"\)/.test(src),
  { worldCap });

check("8b · the wall cap and the read width stay equal, or a full wall loses corners",
  LOOK_AT >= MOST_KEYWORDS && /LOOK_AT < MOST_KEYWORDS/.test(src),
  { LOOK_AT, MOST_KEYWORDS, guarded: /LOOK_AT < MOST_KEYWORDS/.test(src) });

/* 9 — nothing is charged for work that did not happen */
{
  const admitAt = src.indexOf("const gate = await admit(");
  const finallyAt = src.lastIndexOf("} finally {");
  const tryAt = src.lastIndexOf("  try {", finallyAt);
  const beforeTry = src.slice(admitAt, tryAt);
  const exitsBeforeTry = (beforeTry.match(/return NextResponse\.json\(/g) || []).length;
  const settlesBeforeTry = (beforeTry.match(/await settle\(\)/g) || []).length;
  check("9 · every charged exit returns the allowance",
    settlesBeforeTry >= exitsBeforeTry
      && /\} finally \{\s*await settle\(\);/.test(src)
      && /if \(!delivered\) await refund/.test(src),
    { exitsBeforeTry, settlesBeforeTry, hasFinally: /\} finally \{/.test(src) });
}

check("10 · an unchanged world is refused before anything is charged",
  src.indexOf("Nothing has changed across your world") < src.indexOf("const gate = await admit("),
  { checkedBeforeAdmit:
      src.indexOf("Nothing has changed across your world") < src.indexOf("const gate = await admit(") });

console.log(`LOOK_AT = ${LOOK_AT}  MOST_KEYWORDS = ${MOST_KEYWORDS}  world cap = ${worldCap}/week\n`);
let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  if (!r.pass) console.log("      " + JSON.stringify(r.detail));
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
