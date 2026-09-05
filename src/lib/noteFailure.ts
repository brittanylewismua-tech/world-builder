import { serviceDb } from "@/lib/pinterest";

/**
 * A FAILURE THE SELLER NEVER SEES STILL HAS TO BE SEEN BY SOMEBODY.
 *
 * report() writes to the same error log, but it runs in the browser and
 * identifies the user from their session. Half the work in this product
 * happens where there is no session: a cron writing a paper at four in the
 * morning, a shop sweep pulling Etsy on somebody's behalf. Those paths had
 * nothing, so their failures were caught, swallowed to protect the request,
 * and then genuinely gone.
 *
 * That is how a shop went missing from a week of readings with no trace: the
 * pull failed, the catch did its job, and the only evidence was a number that
 * looked slightly too small in a table nobody was reading. Diagnosing it took
 * an hour of queries that should have been one row in the error log.
 *
 * Swallowing the error is still right — one shop that will not answer must
 * not cost a seller their issue. Swallowing it SILENTLY was the mistake.
 */
export async function noteFailure(
  surface: string,
  error: unknown,
  detail: {
    worldId?: string | null;
    userId?: string | null;
    [k: string]: unknown;
  } = {},
) {
  try {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown failure";

    const { worldId, userId, ...rest } = detail;

    await serviceDb()
      .from("wb_errors")
      .insert({
        user_id: userId ?? null,
        world_id: worldId ?? null,
        surface,
        message: message.slice(0, 500),
        detail: { ...rest, at: new Date().toISOString(), via: "server" },
      });
  } catch {
    /*
      The log itself failing must never take down the thing it was watching.
      This is the end of the line; there is nowhere left to report to.
    */
  }
}
