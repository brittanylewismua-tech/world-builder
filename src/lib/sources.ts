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
