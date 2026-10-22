/**
 * Session auth — stateless JWT in an httpOnly cookie.
 *  - HS256 via jose, secret from AUTH_SECRET env
 *  - 30-day sessions, lax same-site cookies (works across the site, blocks CSRF basics)
 *  - bcryptjs password hashing (10 rounds)
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

export const SESSION_COOKIE = "bdix_session";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, seconds

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

function secretKey(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error("AUTH_SECRET is missing or too short");
  return new TextEncoder().encode(s);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub || typeof payload.email !== "string") return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: typeof payload.name === "string" ? payload.name : "",
    };
  } catch {
    return null;
  }
}

/** Read + verify the session from the request cookies (server components / routes). */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Attach the session cookie to a response. */
export function setSessionCookie(res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

/** Clear the session cookie (logout). */
export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}

/* ---------------- validation ---------------- */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateSignup(email: string, name: string, password: string): string | null {
  const e = email.trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 254) return "Please enter a valid email address";
  const n = name.trim();
  if (n.length < 1 || n.length > 60) return "Name must be 1–60 characters";
  if (password.length < 6) return "Password must be at least 6 characters";
  if (password.length > 72) return "Password must be at most 72 characters";
  return null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Tiny in-memory rate limiter (best effort, per server instance).
 * Keyed by identifier — enough to slow down scripted guessing against
 * single-instance deployments; serious abuse protection needs a store.
 */
const attempts = new Map<string, { n: number; resetAt: number }>();

export function rateLimit(key: string, max = 8, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now > a.resetAt) {
    attempts.set(key, { n: 1, resetAt: now + windowMs });
    return true;
  }
  a.n += 1;
  return a.n <= max;
}
