/**
 * GOOGLE TRENDS, THROUGH DATAFORSEO.
 *
 * Google has an official Trends API but it is still application-gated alpha a
 * year after announcement, so in practice this is the way in. DataForSEO
 * queries the public Trends interface and returns it as JSON.
 *
 * Two things are wanted from it, and they cost differently:
 *
 *   the graph   interest over time, 0-100, weekly points. FIVE keywords fit
 *               in one task, so movement is cheap to check across the pool.
 *
 *   rising      the related terms whose search frequency has climbed most.
 *               This is the discovery engine — it is how the pool grows
 *               without anybody typing anything — but it only works with ONE
 *               keyword per task, so it costs five times as much per term and
 *               is used sparingly.
 *
 * Live mode, because a seller presses a button and waits. The queued mode is
 * a quarter of the price but can take 45 minutes, which is the wrong shape
 * for a thing you press.
 */

const API = "https://api.dataforseo.com/v3";

/** US, English. Trends is regional and a world's language is not. */
const LOCATION = 2840;
const LANGUAGE = "en";

export function trendsConfigured() {
  return Boolean(
    process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD,
  );
}

function auth() {
  const login = process.env.DATAFORSEO_LOGIN ?? "";
  const password = process.env.DATAFORSEO_PASSWORD ?? "";
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

async function post(path: string, tasks: unknown[]) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/json" },
    body: JSON.stringify(tasks),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Google Trends ${res.status}: ${text.slice(0, 200)}`);

  let body: { tasks?: unknown[] };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error("Google Trends sent something unreadable.");
  }
  return body.tasks ?? [];
}

/* ------------------------------------------------------------------ */
/* shapes                                                              */
/* ------------------------------------------------------------------ */

/*
  Deliberately defensive. This is somebody else's JSON, five levels deep, and
  a missing branch should cost one term rather than the whole update.
*/
interface Task {
  status_code?: number;
  result?: {
    items?: {
      type?: string;
      keywords?: string[];
      data?: { date_from?: string; values?: (number | null)[] }[];
      rising?: { query?: string; value?: number }[];
      top?: { query?: string; value?: number }[];
    }[];
  }[];
}

export interface Reading {
  term: string;
  /** Latest point on the 0-100 curve. */
  value: number | null;
  /** Every weekly point, for drawing. */
  curve: { at: string; v: number }[];
}

/**
 * Interest over time for up to five terms in one request.
 *
 * Google returns one series per keyword in the order they were asked for,
 * which is the only way to tell them apart — the response does not repeat the
 * keyword against its own series.
 */
export async function readCurves(terms: string[]): Promise<Reading[]> {
  if (!terms.length) return [];
  const batches: string[][] = [];
  for (let i = 0; i < terms.length; i += 5) batches.push(terms.slice(i, i + 5));

  const out: Reading[] = [];
  for (const batch of batches) {
    const tasks = (await post("/keywords_data/google_trends/explore/live", [
      {
        keywords: batch,
        location_code: LOCATION,
        language_code: LANGUAGE,
        time_range: "past_12_months",
        item_types: ["google_trends_graph"],
      },
    ])) as Task[];

    const graph = tasks[0]?.result?.[0]?.items?.find(
      (i) => i.type === "google_trends_graph",
    );
    const points = graph?.data ?? [];

    batch.forEach((term, index) => {
      const curve = points
        .map((p) => ({
          at: p.date_from ?? "",
          v: Number(p.values?.[index] ?? 0),
        }))
        .filter((p) => p.at);
      out.push({
        term,
        value: curve.length ? curve[curve.length - 1].v : null,
        curve,
      });
    });
  }
  return out;
}

/**
 * What is climbing next to one term.
 *
 * One keyword per request — that is DataForSEO's constraint, not a choice —
 * so this is the expensive half and only a few terms get it per update.
 */
export async function readRising(term: string): Promise<string[]> {
  const tasks = (await post("/keywords_data/google_trends/explore/live", [
    {
      keywords: [term],
      location_code: LOCATION,
      language_code: LANGUAGE,
      time_range: "past_12_months",
      item_types: ["google_trends_queries_list"],
    },
  ])) as Task[];

  const list = tasks[0]?.result?.[0]?.items?.find(
    (i) => i.type === "google_trends_queries_list",
  );

  return (list?.rising ?? [])
    .map((r) => (r.query ?? "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 10);
}
