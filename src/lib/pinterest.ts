import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * TALKING TO PINTEREST
 *
 * Server-side only. Access tokens never leave this file's reach — no browser
 * ever holds one, and every route that uses this has already established who
 * the caller is and that the world belongs to them.
 *
 * Written defensively about response shapes. Pinterest returns pin images
 * keyed by size ("600x", "1200x", "originals") and the set varies by pin type,
 * so nothing here assumes a particular key exists.
 */

const API = "https://api.pinterest.com/v5";

/**
 * Same bucket the rest of the product uses. Declared here rather than
 * imported, because lib/supabase.ts is a browser module and these routes run
 * on the server with a service key.
 */
export const ASSETS = "world-assets";

/**
 * Secret boards need their own scopes.
 *
 * boards:read returns public and protected boards only, and no amount of
 * privacy=ALL changes that — the filter cannot hand back something the token
 * was never permitted to see. A seller keeps her competitor research secret
 * as a matter of course, so without these the one board this product most
 * wants is invisible and the failure is silent: the board simply is not in
 * the list, with nothing to say why.
 */
export const PIN_SCOPES = [
  "boards:read",
  "boards:read_secret",
  "pins:read",
  "pins:read_secret",
  "user_accounts:read",
];

/**
 * ONE CALLBACK, WHATEVER HOST THEY ARE ON.
 *
 * This app answers on several hostnames — the project domain, the team alias,
 * preview builds, and a custom domain later. Deriving the OAuth callback from
 * whichever one the seller happened to be browsing meant Pinterest rejected
 * the round trip with "redirect URI does not match" unless every hostname was
 * registered, forever, including ones that do not exist yet.
 *
 * So the callback is a single fixed URL that is registered once. Where the
 * seller was when they started travels inside the signed state instead, and
 * they are sent back there at the end — so they return to the session they
 * already had rather than to a domain where they are a stranger.
 */
export const REDIRECT_URI =
  process.env.PINTEREST_REDIRECT_URI ||
  "https://world-builder-u8x3.vercel.app/api/pinterest/callback";

export function pinterestConfigured() {
  return !!(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET);
}

export function serviceDb(): SupabaseClient {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://ywncfltxrnrchicjwcse.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false } });
}

/* ------------------------------------------------------------------ */
/* oauth                                                               */
/* ------------------------------------------------------------------ */

export function authorizeUrl(redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: process.env.PINTEREST_APP_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: PIN_SCOPES.join(","),
    state,
  });
  return `https://www.pinterest.com/oauth/?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

async function tokenCall(body: URLSearchParams): Promise<TokenResponse> {
  const basic = Buffer.from(
    `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Pinterest token ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenCall(
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  );
}

/**
 * Pinterest tokens expire. Refreshing on the way in means a seller who
 * connected two months ago and forgot about it still gets their pins, rather
 * than an error that reads like the integration is broken.
 */
export async function tokenFor(worldId: string): Promise<string> {
  const db = serviceDb();
  const { data } = await db
    .from("wb_pinterest_accounts")
    .select("access_token, refresh_token, expires_at")
    .eq("world_id", worldId)
    .single();

  if (!data) throw new Error("This world is not connected to Pinterest yet.");

  const expires = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const nearlyDue = expires && expires - Date.now() < 5 * 60_000;
  if (!nearlyDue || !data.refresh_token) return data.access_token as string;

  const fresh = await tokenCall(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: data.refresh_token as string,
    }),
  );
  await db
    .from("wb_pinterest_accounts")
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token ?? data.refresh_token,
      expires_at: fresh.expires_in
        ? new Date(Date.now() + fresh.expires_in * 1000).toISOString()
        : null,
    })
    .eq("world_id", worldId);

  return fresh.access_token;
}

/* ------------------------------------------------------------------ */
/* reading                                                             */
/* ------------------------------------------------------------------ */

async function get(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) {
    /*
      Trial access is rate limited per app per day rather than per user, so a
      429 here is a shared ceiling rather than one seller being greedy. Say so
      plainly; it is a real answer, not a fault.
    */
    if (res.status === 429)
      throw new Error(
        "Pinterest's daily limit for this app has been reached. It resets tomorrow.",
      );
    throw new Error(`Pinterest ${res.status}: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text);
}

export interface PinBoard {
  id: string;
  name: string;
  description: string;
  pinCount: number;
  cover: string | null;
}

export async function listBoards(token: string): Promise<PinBoard[]> {
  const out: PinBoard[] = [];
  let bookmark = "";
  // A few pages is plenty; nobody is choosing from four hundred boards.
  for (let page = 0; page < 4; page++) {
    /*
      privacy=ALL so secret boards come back too. Sellers keep competitor
      research secret as a matter of course — a "what is selling" board is not
      something you want public on your own profile — and defaulting to public
      only would have hidden exactly the board this product most wants.
    */
    const q = new URLSearchParams({ page_size: "50", privacy: "ALL" });
    if (bookmark) q.set("bookmark", bookmark);
    const data = await get(`/boards?${q}`, token);
    for (const b of data.items ?? [])
      out.push({
        id: String(b.id),
        name: String(b.name ?? "Untitled board"),
        description: String(b.description ?? ""),
        pinCount: Number(b.pin_count ?? 0),
        cover: b.media?.image_cover_url ?? null,
      });
    bookmark = data.bookmark ?? "";
    if (!bookmark) break;
  }
  return out;
}

export interface Pin {
  id: string;
  title: string;
  description: string;
  altText: string;
  link: string | null;
  imageUrl: string | null;
}

/** Prefer a large-but-not-enormous rendition; fall back to whatever exists. */
function bestImage(media: unknown): string | null {
  const images = (media as { images?: Record<string, { url?: string }> })
    ?.images;
  if (!images) return null;
  for (const key of ["1200x", "600x", "originals", "400x300", "150x150"]) {
    const url = images[key]?.url;
    if (url) return url;
  }
  const first = Object.values(images)[0];
  return first?.url ?? null;
}

export async function listPins(
  token: string,
  boardId: string,
  max = 20,
): Promise<Pin[]> {
  const out: Pin[] = [];
  let bookmark = "";
  while (out.length < max) {
    /*
      page_size matches the batch exactly, so twenty pins costs exactly one
      request. Trial access is 1,000 requests a day for the whole app, shared
      by every seller — at two requests a board only about a hundred people
      can bring in four boards in a day, and at one request it is two hundred.
      The seller who wants more presses the button and spends one more.
    */
    const q = new URLSearchParams({ page_size: String(Math.min(max, 50)) });
    if (bookmark) q.set("bookmark", bookmark);
    const data = await get(`/boards/${boardId}/pins?${q}`, token);
    for (const p of data.items ?? []) {
      const imageUrl = bestImage(p.media);
      out.push({
        id: String(p.id),
        title: String(p.title ?? ""),
        description: String(p.description ?? ""),
        altText: String(p.alt_text ?? ""),
        link: p.link ?? null,
        imageUrl,
      });
      if (out.length >= max) break;
    }
    bookmark = data.bookmark ?? "";
    if (!bookmark) break;
  }
  return out;
}
