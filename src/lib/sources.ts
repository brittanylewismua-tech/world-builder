/**
 * A SOURCE HAS TO GO SOMEWHERE.
 *
 * Every citation was checked for being real and none of them for being
 * useful, so issues shipped linking to "https://tiktok.com", "https://etsy.com"
 * and a dozen tiktok.com/discover/… pages. Those are real URLs that a search
 * really returned, and clicking one drops the seller on a homepage or a
 * keyword feed — which is worse than no link, because it spends their trust
 * and gives nothing back.
 *
 * So a source now has to be a specific page: a post, a video, an article.
 * Anything that is a front door, a search result, or a hashtag index is not a
 * source and does not ship.
 */
export const NOT_A_PAGE =
  /^\/(discover|search|explore|tag|tags|hashtag|hashtags|topic|topics|trending|browse|category|collections?|shop|s|str)(\/|$)/i;

export function usableSource(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;

  const path = u.pathname.replace(/\/+$/, "");
  // A bare domain is a front door, never a citation.
  if (!path || path === "/") return false;
  if (NOT_A_PAGE.test(path)) return false;

  const host = u.hostname.replace(/^www\./, "");

  // The platforms worth naming individually, because their useless pages look
  // exactly like their useful ones until you read the path.
  if (host.endsWith("tiktok.com"))
    return /\/(video|photo)\/\d+/.test(path) || /^\/t\//.test(path);
  if (host.endsWith("instagram.com")) return /^\/(p|reel|tv)\//.test(path);
  if (host.endsWith("youtube.com"))
    return /^\/shorts\//.test(path) || u.searchParams.has("v");
  if (host === "youtu.be") return path.length > 1;
  if (host.endsWith("reddit.com")) return /\/comments\//.test(path);
  if (host.endsWith("pinterest.com")) return /^\/pin\//.test(path);

  // Everywhere else: a path with something in it is enough.
  return path.length > 1;
}



/**
 * THE SAME PAGE, WRITTEN TWO WAYS.
 *
 * A citation has to be a page a search actually returned, and that guarantee
 * is checked by comparing strings. Compared raw, it breaks constantly: the
 * search tool hands back a URL with a tracking parameter, the model writes it
 * down without one, and an identical page fails to match itself. World News
 * once threw away every source in an issue for exactly that reason, and the
 * seller was told nothing could be verified while both models had run and
 * billed.
 *
 * So strip what does not identify the page — the fragment, the trackers, a
 * trailing slash — and compare what is left.
 */
export function normalise(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const junk of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "fbclid",
      "gclid",
      "igshid",
      "si",
    ])
      url.searchParams.delete(junk);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}


/**
 * A SHOP IS NOT THE WORLD.
 *
 * A seller's keywords come from eRank, so they are shopping terms — "eat the
 * rich shirt", "immigrant shirt", "anti war shirt". Search one of those on the
 * open web and you get shops selling exactly that, which is how the first run
 * of the web came back as a catalogue of eleven competitors' listings and
 * nothing else.
 *
 * Marketplaces are easy to name. Independent shops are not — they live on
 * ordinary domains — but they nearly all share a URL shape, because they are
 * nearly all running the same handful of storefront platforms.
 */
const MARKETPLACES =
  /(^|\.)(etsy|redbubble|teepublic|amazon|ebay|zazzle|society6|spreadshirt|teespring|threadless|bonfire|customink|printful|printify|walmart|target|aliexpress|temu|shopify|gumroad|displate)\./i;

const STOREFRONT_PATH =
  /^\/(listing|listings|products?|collections|shop|store|item|dp|gp)(\/|$)/i;

export function isShop(raw: string) {
  try {
    const u = new URL(raw);
    if (MARKETPLACES.test(u.hostname)) return true;
    return STOREFRONT_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * The subject, without the shopping.
 *
 * "eat the rich shirt" is a thing to buy. "eat the rich" is a thing people
 * say — and the second one is what the world is actually made of.
 */
const COMMERCE_WORDS =
  /\b(shirt|t-?shirt|tee|tees|hoodie|sweatshirt|sweater|crewneck|mug|tote|sticker|stickers|poster|print|prints|apparel|merch|gift|gifts|design|designs|svg|png|for sale|buy|cheap|custom)\b/gi;

export function subjectOf(keyword: string) {
  const stripped = keyword.replace(COMMERCE_WORDS, " ").replace(/\s+/g, " ").trim();
  return stripped.length >= 3 ? stripped : keyword;
}

/**
 * PUT A TRIMMED CITATION BACK ON THE PAGE IT CAME FROM.
 *
 * The judge is told, at length, to reproduce a source URL exactly as the notes
 * give it. It does not reliably do so. It shortens
 * "medusasbody.substack.com/p/some-essay" to "medusasbody.substack.com",
 * because the short form looks like a cleaner citation — and a bare domain
 * fails verification, so the item is dropped and the seller gets an empty
 * paper about a week that was not empty. That happened twice tonight, once
 * after the instruction was made explicit.
 *
 * Instructions were the wrong tool. A model asked not to tidy a URL will tidy
 * a URL, and no amount of capital letters changes that reliably.
 *
 * So this repairs instead. Given a citation and the set of URLs a search
 * genuinely returned, if the citation is a truncation of exactly one real
 * page, that page is what was meant, and it is substituted.
 *
 * IT CANNOT INVENT A SOURCE, WHICH IS THE WHOLE POINT. Every URL it can
 * return was really returned by a real search; the only thing being recovered
 * is which of them a shortened string refers to. Ambiguity is refused rather
 * than guessed: if a bare domain matches four different articles, there is no
 * way to know which was read, and the item is dropped exactly as before.
 */
export function repairSource(
  cited: string,
  seen: Iterable<string>,
  normalise: (u: string) => string,
): string | null {
  const want = normalise(cited).replace(/\/+$/, "");
  if (!want) return null;

  const matches: string[] = [];
  for (const real of seen) {
    const r = normalise(real).replace(/\/+$/, "");
    if (r === want) return real;
    /* A prefix, and only at a path boundary: example.com must not match
       example.completely-different.com. */
    if (r.startsWith(want + "/")) matches.push(real);
  }

  return matches.length === 1 ? matches[0] : null;
}
