/**
 * TALKING TO ETSY.
 *
 * Everything here runs on the application key alone — no shop owner has to
 * authorise anything, which is what makes reading somebody else's shop
 * possible at all. That was the question the whole feature hung on and it
 * came back open.
 *
 * The key goes in as keystring:secret. The documentation says the keystring
 * alone; the live API answers 403 with "incorrect shared secret for API key"
 * until you join them.
 */
export const ETSY = "https://openapi.etsy.com/v3/application";

export function etsyKey() {
  const k = process.env.ETSY_API_KEY?.trim();
  const s = process.env.ETSY_SHARED_SECRET?.trim();
  if (!k) return null;
  return s ? `${k}:${s}` : k;
}

export async function etsyGet<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${ETSY}${path}`, {
    headers: { "x-api-key": key, accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Etsy would not accept the API key."
        : res.status === 404
          ? "Etsy has no record of that."
          : `Etsy returned ${res.status}.`,
    );
  }
  return (await res.json()) as T;
}

/**
 * A shop name out of whatever the seller pasted.
 *
 * People paste the listing they were looking at, the shop page, the shop page
 * with Etsy's tracking junk on the end, or just the name. All of those should
 * work, because asking somebody to extract the name themselves is asking them
 * to do the computer's job.
 */
export function shopNameFrom(input: string) {
  const raw = input.trim();
  const fromUrl = raw.match(/etsy\.com\/(?:[a-z-]+\/)?shop\/([A-Za-z0-9_-]+)/i);
  if (fromUrl) return fromUrl[1];
  // A bare name, possibly with stray punctuation or an @ in front.
  const bare = raw.replace(/^@/, "").match(/^[A-Za-z0-9_-]{3,40}$/);
  return bare ? bare[0] : null;
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  url?: string;
  listing_active_count?: number;
  num_favorers?: number;
  review_count?: number;
  review_average?: number;
  transaction_sold_count?: number;
  create_date?: number;
}

export interface EtsyListing {
  listing_id: number;
  title?: string;
  url?: string;
  views?: number;
  num_favorers?: number;
  tags?: string[];
  original_creation_timestamp?: number;
  price?: { amount?: number; divisor?: number };
}

export interface EtsyImage {
  listing_id?: number;
  url_570xN?: string;
  url_fullxfull?: string;
  alt_text?: string | null;
}

export async function findShop(name: string, key: string) {
  const j = await etsyGet<{ results?: EtsyShop[] }>(
    `/shops?shop_name=${encodeURIComponent(name)}&limit=10`,
    key,
  );
  const results = j.results ?? [];
  // The search is fuzzy, so prefer the shop whose name is exactly what was
  // asked for rather than whatever Etsy ranked first.
  return (
    results.find(
      (s) => s.shop_name?.toLowerCase() === name.toLowerCase(),
    ) ?? results[0] ?? null
  );
}

/**
 * The whole catalogue, not the first page.
 *
 * This is the reason the API is worth the trouble: a scraper sees whatever
 * Etsy renders on page one, while a hundred listings come back per call. A
 * three hundred listing shop is three requests.
 */
export async function allListings(
  shopId: number,
  key: string,
  cap = 500,
): Promise<EtsyListing[]> {
  const out: EtsyListing[] = [];
  for (let offset = 0; offset < cap; offset += 100) {
    const j = await etsyGet<{ count?: number; results?: EtsyListing[] }>(
      `/shops/${shopId}/listings/active?limit=100&offset=${offset}`,
      key,
    );
    const page = j.results ?? [];
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}

/**
 * One image per listing, in batches of a hundred.
 *
 * Asking each listing for its images separately would be three hundred
 * requests for one shop. The batch endpoint takes a hundred ids and returns
 * their images with them, which is the same trick World Winners already uses.
 */
export async function imagesFor(
  ids: number[],
  key: string,
): Promise<Map<number, { url: string | null; alt: string | null }>> {
  const found = new Map<number, { url: string | null; alt: string | null }>();
  for (let i = 0; i < ids.length; i += 100) {
    const slice = ids.slice(i, i + 100);
    try {
      const j = await etsyGet<{
        results?: { listing_id?: number; images?: EtsyImage[] }[];
      }>(
        `/listings/batch?listing_ids=${slice.join(",")}&includes=Images`,
        key,
      );
      for (const l of j.results ?? []) {
        const first = l.images?.[0];
        if (!l.listing_id) continue;
        found.set(l.listing_id, {
          url: first?.url_570xN ?? first?.url_fullxfull ?? null,
          alt: first?.alt_text?.trim() || null,
        });
      }
    } catch {
      // A batch that will not come back costs those hundred their pictures,
      // not the whole shop.
    }
  }
  return found;
}

export interface EtsyReview {
  listing_id?: number;
  rating?: number;
  review?: string;
  created_timestamp?: number;
}

/**
 * Reviews, newest first, as many as asked for.
 *
 * Most of them say "great quality, fast shipping" — on a real shop about half
 * carry any content and a fifth name a person or an occasion. That is still
 * hundreds of usable sentences on a shop with two thousand reviews, and the
 * filtering is done after they are here.
 */
export async function reviewsFor(
  shopId: number,
  key: string,
  want = 300,
): Promise<EtsyReview[]> {
  const out: EtsyReview[] = [];
  for (let offset = 0; offset < want; offset += 100) {
    const j = await etsyGet<{ results?: EtsyReview[] }>(
      `/shops/${shopId}/reviews?limit=100&offset=${offset}`,
      key,
    );
    const page = j.results ?? [];
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}
