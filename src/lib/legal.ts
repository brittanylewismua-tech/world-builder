/**
 * THE FACTS BOTH LEGAL PAGES ARE BUILT FROM.
 *
 * One place, because the terms and the privacy policy have to agree with each
 * other and with reality. A privacy policy that contradicts the software is
 * worse than none — it is a written record of a promise the product does not
 * keep.
 *
 * When any of this changes, change it here and change LAST_UPDATED with it.
 */

/**
 * The company these documents bind, exactly as registered. "The Goldie
 * Suite" is a trading name; this is the legal person. No suffix — the
 * registration carries none, and adding one would name a company that does
 * not exist.
 */
export const COMPANY = "Be A Wolf Biz";

/**
 * The state of registration, which decides the governing law. Pages that
 * mention it leave the phrase out entirely when this is empty, rather than
 * printing a placeholder at a reader.
 */
export const STATE = "California";

export const PRODUCT = "World Builder";
export const SUITE = "The Goldie Suite";
export const CONTACT = "goldie@beawolfbiz.com";

/** Change this whenever either document changes in substance. */
export const LAST_UPDATED = "31 August 2026";

/**
 * Everyone who processes a customer's data on this product's behalf.
 *
 * A privacy policy is only honest if this list is complete, so it is derived
 * from what the code actually talks to rather than from memory.
 */
export const PROCESSORS: { name: string; does: string; where: string }[] = [
  {
    name: "Supabase",
    does: "Holds the database, the sign-in system and every uploaded image.",
    where: "United States",
  },
  {
    name: "Vercel",
    does: "Runs the website and its servers, and keeps short-lived request logs.",
    where: "United States",
  },
  {
    name: "Anthropic",
    does: "Provides the AI models that write the research and hold the conversations.",
    where: "United States",
  },
  {
    name: "Google",
    does: "Only if you choose to sign in with Google, which tells us your email address.",
    where: "United States",
  },
  {
    name: "Pinterest",
    does: "Only if you connect it. We read the boards you point us at and never write anything.",
    where: "United States",
  },
  {
    name: "Etsy",
    does: "We read public shop and listing information through their official API. We never connect to your Etsy account.",
    where: "United States",
  },
];
