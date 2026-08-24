import { NextResponse } from "next/server";
import { readState } from "@/lib/guard";
import { REDIRECT_URI, exchangeCode, serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";

/** Where Pinterest sends them back. Verifies the signature, stores the token. */
export async function GET(req: Request) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const payload = readState(state);

  // Everything below needs the state to know where the seller came from, so
  // a missing or forged one falls back to this deployment's own profile.
  const [worldId, issuedAt, from] = (payload ?? "").split("|");
  const home = `${from || url.origin}/profile`;

  if (url.searchParams.get("error"))
    return NextResponse.redirect(`${home}?pinterest=cancelled`);

  if (!code || !payload)
    return NextResponse.redirect(`${home}?pinterest=failed`);
  /*
    Half an hour, not ten minutes.
    
    Ten was plenty for a machine and nowhere near enough for a person, who
    reads the permission screen, maybe signs into Pinterest first, gets
    interrupted, and comes back. The first real attempt at this failed for
    exactly that reason. The state is signed and carries its own timestamp, so
    a longer window costs nothing.
  */
  if (!worldId || Date.now() - Number(issuedAt) > 30 * 60_000)
    return NextResponse.redirect(`${home}?pinterest=expired`);

  try {
    // Must be byte-identical to the one sent at the start of the round trip.
    const token = await exchangeCode(code, REDIRECT_URI);
    await serviceDb()
      .from("wb_pinterest_accounts")
      .upsert({
        world_id: worldId,
        access_token: token.access_token,
        refresh_token: token.refresh_token ?? null,
        expires_at: token.expires_in
          ? new Date(Date.now() + token.expires_in * 1000).toISOString()
          : null,
        connected_at: new Date().toISOString(),
      });
    return NextResponse.redirect(`${home}?pinterest=connected`);
  } catch {
    return NextResponse.redirect(`${home}?pinterest=failed`);
  }
}
