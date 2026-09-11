/**
 * SMART KEYWORD ENTRY
 *
 * Sellers do their research in eRank and then have to get it in here. Making
 * them retype thirty keywords one at a time is the kind of small cruelty that
 * makes people stop using a tool.
 *
 * So: type one and hit enter, type several separated by commas, or paste a
 * block straight out of eRank — table rows, a CSV export, or a plain list —
 * and we take the keywords and throw the numbers away.
 *
 * This is deliberately deterministic rather than an AI call. It is instant,
 * free, and predictable, and whatever it finds is shown for approval before
 * anything is saved, so a bad guess costs one click rather than thirty rows.
 */

/** Column headers eRank and its neighbours use. A row of these is not data. */
const HEADERS = [
  "keyword",
  "keywords",
  "tag",
  "tags",
  "search",
  "searches",
  "avg searches",
  "average searches",
  "volume",
  "competition",
  "click",
  "clicks",
  "ctr",
  "etsy",
  "google",
  "character",
  "characters",
  "count",
  "trend",
  "score",
  "rank",
  "results",
  "engagement",
  "conversion",
  "long tail",
  "category",
];

/** Anything that is only digits, separators, currency, percentages or n/a. */
const NUMERIC = /^[\s\d.,%$£€+\-–—/:]*$/;
const NA = /^(n\/?a|--?|none|unknown)$/i;

const isNumeric = (s: string) => s.trim() !== "" && NUMERIC.test(s.trim());
const isBlank = (s: string) => s.trim() === "" || NA.test(s.trim());

/**
 * Words that pad a column title without naming anything: "Avg Searches",
 * "Total Results". Harmless inside a real keyword, so they never make a cell
 * header-ish on their own — they only fail to disqualify one.
 */
const FILLER = new Set([
  "avg", "average", "total", "est", "estimated", "per", "of", "the", "and",
  "no", "num", "#", "%", "vs", "level", "monthly", "daily",
]);

/**
 * A ROW OF COLUMN HEADERS, RATHER THAN A ROW OF DATA.
 *
 * This asked whether any cell CONTAINED a header word, anywhere, as a plain
 * substring — and a single hit condemned the whole line. The result was a
 * silent blocklist nobody wrote on purpose:
 *
 *   "Etsy Witch"          contains "etsy"
 *   "Vintage Golf Decor"  contains "tag"  — v-in-TAG-e
 *   "Trending Now"        contains "trend"
 *   "Count Me In"         contains "count"
 *   "Search Party"        contains "search"
 *   "Score Keeper"        contains "score"
 *
 * Every one of those was thrown away on the way in, with no message, because
 * the parser had decided the seller was pasting a spreadsheet header. A seller
 * typing "Etsy Witch" pressed enter and watched nothing happen — twice, then
 * gave up and emailed.
 *
 * Two things were wrong and both are fixed here.
 *
 * FIRST, ONE CELL IS NEVER A HEADER ROW. A header row has columns. A person
 * typing a single keyword has one cell, so that line is data by definition,
 * whatever it says — even the literal word "keyword" is a legitimate thing to
 * research.
 *
 * SECOND, MATCH WHOLE WORDS, NOT SUBSTRINGS, AND JUDGE THE CELL AS A WHOLE. A
 * cell is header-ish only when EVERY word in it is a column word or filler.
 * "Etsy Competition" and "Avg Searches" still pass as headers, because every
 * word in them is one. "Etsy Witch" does not, because "witch" is not.
 */
/* HEADERS holds some multi-word titles ("avg searches", "long tail"); the
   per-word test needs their words individually. */
const HEADER_WORDS = new Set(HEADERS.flatMap((h) => h.split(/\s+/)));

function isHeaderCell(cell: string) {
  const words = cell.split(/[^a-z0-9#%]+/).filter(Boolean);
  if (!words.length) return false;
  return words.every((w) => HEADER_WORDS.has(w) || FILLER.has(w));
}

function looksLikeHeader(cells: string[]) {
  const clean = cells.map((c) => c.trim().toLowerCase()).filter(Boolean);
  /* One column is a keyword somebody typed, not a header row. */
  if (clean.length < 2) return false;
  const hits = clean.filter(isHeaderCell);
  return hits.length >= Math.ceil(clean.length / 2);
}

/**
 * Strip the metrics off the end of a line that had no real delimiter, e.g.
 * "jesus loves you shirt 1,300 820 42%" → "jesus loves you shirt".
 * Only trailing tokens go; a number inside a keyword ("psalm 23 shirt") stays.
 */
function stripTrailingNumbers(line: string) {
  const parts = line.trim().split(/\s+/);
  while (parts.length > 1) {
    const last = parts[parts.length - 1];
    if (isNumeric(last) || NA.test(last)) parts.pop();
    else break;
  }
  return parts.join(" ");
}

/** Drop a leading list marker: "1.", "12)", "- ", "• ". */
const stripBullet = (s: string) =>
  s.replace(/^\s*(?:\d{1,3}[.)]\s+|[-•*·]\s+)/, "");

/** Split a line into cells on whichever delimiter it actually uses. */
function cellsOf(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  // CSV, honouring quoted fields so "1,300" inside quotes stays whole.
  if (line.includes(",")) {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  }
  return [line];
}

const tidy = (s: string) =>
  s
    .replace(/^"+|"+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

export interface Parsed {
  keywords: string[];
  /** How many lines were recognised as numbers or headers and dropped. */
  dropped: number;
}

/**
 * Pull keywords out of anything a seller is likely to paste or type.
 *
 * `typed` means a single line the person wrote themselves, where commas are
 * separators. In pasted text commas are usually thousands separators inside
 * eRank's numbers, so they are treated as CSV delimiters instead and only the
 * first field survives.
 */
export function parseKeywords(input: string): Parsed {
  const text = input.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const multiline = lines.filter((l) => l.trim()).length > 1;
  const tabbed = text.includes("\t");

  const out: string[] = [];
  let dropped = 0;

  for (const raw of lines) {
    if (!raw.trim()) continue;

    const line = stripBullet(raw);
    const cells = cellsOf(line);

    if (looksLikeHeader(cells)) {
      dropped++;
      continue;
    }

    // A single typed line with commas and no metrics is a list of keywords.
    const typedList =
      !multiline &&
      !tabbed &&
      cells.length > 1 &&
      !cells.slice(1).some((c) => isNumeric(c) || isBlank(c));

    const candidates = typedList ? cells : [cells[0]];

    for (const c of candidates) {
      const value = tidy(stripTrailingNumbers(tidy(c)));
      if (!value || isNumeric(value) || isBlank(value)) {
        dropped++;
        continue;
      }
      // A "keyword" longer than this is a sentence someone pasted by mistake.
      if (value.length > 80) {
        dropped++;
        continue;
      }
      out.push(value);
    }
  }

  // Dedupe within the batch, keeping the first spelling seen.
  const seen = new Set<string>();
  const keywords = out.filter((k) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { keywords, dropped };
}

/** Split a batch against what is already in the world. */
export function against(keywords: string[], existing: string[]) {
  const have = new Set(existing.map((e) => e.toLowerCase()));
  const fresh: string[] = [];
  let duplicates = 0;
  for (const k of keywords) {
    if (have.has(k.toLowerCase())) duplicates++;
    else fresh.push(k);
  }
  return { fresh, duplicates };
}
