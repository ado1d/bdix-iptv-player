import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/me → { user: {...} | null } */
export async function GET() {
  try {
    const user = await getSession();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
