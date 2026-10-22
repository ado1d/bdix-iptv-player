import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, setSessionCookie, verifyPassword, normalizeEmail, rateLimit } from "@/lib/auth";
import { ensureSchema, findUserByEmail } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/login — { email, password } → session cookie */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const email = normalizeEmail(String(body.email ?? ""));
    const password = String(body.password ?? "");
    if (!email || !password) {
      return NextResponse.json({ error: "Enter your email and password" }, { status: 400 });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(`login:${ip}:${email}`)) {
      return NextResponse.json({ error: "Too many attempts — try again in a few minutes" }, { status: 429 });
    }

    await ensureSchema();

    const user = await findUserByEmail(email);
    // uniform error (no account enumeration)
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    const token = await createSessionToken({ id: user.id, email: user.email, name: user.name });
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    return setSessionCookie(res, token);
  } catch (err) {
    console.error("[login]", err);
    return NextResponse.json({ error: "Couldn't sign you in — please try again" }, { status: 500 });
  }
}
