import { NextRequest, NextResponse } from "next/server";
import {
  createSessionToken,
  setSessionCookie,
  hashPassword,
  validateSignup,
  normalizeEmail,
  rateLimit,
} from "@/lib/auth";
import { ensureSchema, createUser, findUserByEmail } from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/signup — { email, name, password } → creates account + session */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

    const email = String(body.email ?? "");
    const name = String(body.name ?? "");
    const password = String(body.password ?? "");

    const invalid = validateSignup(email, name, password);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const emailNorm = normalizeEmail(email);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (!rateLimit(`signup:${ip}`)) {
      return NextResponse.json({ error: "Too many attempts — try again in a few minutes" }, { status: 429 });
    }

    await ensureSchema();

    const existing = await findUserByEmail(emailNorm);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists — try signing in" },
        { status: 409 }
      );
    }

    const user = await createUser(emailNorm, name.trim(), hashPassword(password));
    const token = await createSessionToken(user);
    const res = NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
    return setSessionCookie(res, token);
  } catch (err) {
    console.error("[signup]", err);
    return NextResponse.json({ error: "Couldn't create your account — please try again" }, { status: 500 });
  }
}
