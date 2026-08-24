import { NextResponse } from "next/server";
import { ownerOf, signState } from "@/lib/guard";
import { authorizeUrl, pinterestConfigured } from "@/lib/pinterest";

export const runtime = "nodejs";

/**
 * Begin connecting a Pinterest account to a world.
 *
 * The caller is checked here, once, and the world id is then carried through
 * Pinterest and back inside a signed state string. That matters because this
 * app keeps its session in the browser rather than in a cookie, so when
 * Pinterest redirects back, the callback has no session to inspect — the
 * signature is what proves the round trip started with someone who owned this
 * world.
 */
export async function POST(req: Request) {
  if (!pinterestConfigured())
    return NextResponse.json(
      {
        error:
          "Pinterest is not set up on this deployment yet. It needs PINTEREST_APP_ID and PINTEREST_APP_SECRET.",
      },
      { status: 503 },
    );

  let body: { worldId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!body.worldId)
    return NextResponse.json({ error: "No world given." }, { status: 400 });

  const door = await ownerOf(req, body.worldId);
  if ("deny" in door) return door.deny;

  const redirectUri = `${new URL(req.url).origin}/api/pinterest/callback`;
  const state = signState(`${body.worldId}:${Date.now()}`);

  return NextResponse.json({ url: authorizeUrl(redirectUri, state) });
}
