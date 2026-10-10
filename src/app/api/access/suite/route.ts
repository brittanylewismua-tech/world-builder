import { NextResponse } from "next/server";
import { syncFromSuite } from "@/lib/suiteAccess";
import { callerOf } from "@/lib/billing";

export const runtime = "nodejs";

/* The door asks this on every visit: check The Goldie Suite and update access. */
export async function POST(req: Request) {
  const caller = await callerOf(req);
  if (!caller) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const token = (req.headers.get("authorization") ?? "").slice(7).trim();
  const live = await syncFromSuite(caller.id, token);
  return NextResponse.json({ live, email: caller.email }, { headers: { "Cache-Control": "no-store" } });
}
