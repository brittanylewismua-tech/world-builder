import { NextResponse } from "next/server";
import { readState } from "@/lib/guard";
import { exchangeCode, serviceDb } from "@/lib/pinterest";

export const runtime = "nodejs";

/** Where Pinterest sends them back. Verifies the signature, stores the token. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const home = `${url.origin}/profile`;

  const denied = url.searchParams.get("error");
  if (denied)
    return NextResponse.redirect(`${home}?pinterest=cancelled`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  const payload = readState(state);

  if (!code || !payload)
    return NextResponse.redirect(`${home}?pinterest=failed`);

  const [worldId, issuedAt] = payload.split(":");
  // Ten minutes is more than enough to approve a screen, and short enough
  // that a state string found later is worthless.
  if (!worldId || Date.now() - Number(issuedAt) > 10 * 60_000)
    return NextResponse.redirect(`${home}?pinterest=expired`);

  try {
    const token = await exchangeCode(
      code,
      `${url.origin}/api/pinterest/callback`,
    );
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
