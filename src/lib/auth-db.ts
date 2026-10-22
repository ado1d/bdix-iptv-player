/**
 * PostgreSQL pool (Render) + schema bootstrap for accounts & user-data sync.
 *
 * Tables:
 *  - users:      id, email (unique), name, password_hash, timestamps
 *  - user_data:  one row per user — favorites / recents / playlists / prefs (JSONB)
 *
 * The pool is stored on globalThis so Next.js hot reloads / serverless warm
 * instances reuse connections instead of opening new ones.
 */
import { Pool } from "pg";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.AUTH_DATABASE_URL,
    // Render's external PG endpoint requires TLS (self-signed cert chain)
    ssl: process.env.AUTH_DATABASE_URL?.includes("render.com")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 3, // keep well under Render free-tier connection limits
    idleTimeoutMillis: 15_000,
    connectionTimeoutMillis: 12_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

let schemaPromise: Promise<void> | null = null;

/** Create tables if missing (idempotent, runs once per process). */
export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          email TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_data (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          favorites JSONB NOT NULL DEFAULT '[]'::jsonb,
          recents JSONB NOT NULL DEFAULT '[]'::jsonb,
          playlists JSONB NOT NULL DEFAULT '[]'::jsonb,
          prefs JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
    })().catch((err) => {
      schemaPromise = null; // allow retry after transient failure
      throw err;
    });
  }
  return schemaPromise;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT id, email, name, password_hash, created_at FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  return rows[0] ?? null;
}

export async function createUser(
  email: string,
  name: string,
  passwordHash: string
): Promise<{ id: string; email: string; name: string }> {
  const { rows } = await pool.query(
    `INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)
     RETURNING id, email, name`,
    [email, name, passwordHash]
  );
  return rows[0];
}

/* ---------------- user data sync ---------------- */

export interface PlaylistMeta {
  id: string;
  name: string;
  url: string;
  addedAt: number;
}

export interface UserDataPayload {
  favorites: string[];
  recents: string[];
  playlists: PlaylistMeta[];
  prefs: {
    playMode?: "auto" | "direct" | "proxy";
    autoSkip?: boolean;
    volume?: number;
    muted?: boolean;
  };
  updatedAt?: string;
}

const EMPTY: UserDataPayload = { favorites: [], recents: [], playlists: [], prefs: {} };

export async function getUserData(userId: string): Promise<UserDataPayload> {
  // lazily create the row on first read (e.g. accounts predating data rows)
  await pool.query(
    `INSERT INTO user_data (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
  const { rows } = await pool.query(
    `SELECT favorites, recents, playlists, prefs, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
     FROM user_data WHERE user_id = $1`,
    [userId]
  );
  if (!rows[0]) return { ...EMPTY };
  const r = rows[0];
  return {
    favorites: Array.isArray(r.favorites) ? r.favorites : [],
    recents: Array.isArray(r.recents) ? r.recents : [],
    playlists: Array.isArray(r.playlists) ? r.playlists : [],
    prefs: (r.prefs && typeof r.prefs === "object" ? r.prefs : {}) as UserDataPayload["prefs"],
    updatedAt: r.updated_at ?? undefined,
  };
}

export async function saveUserData(userId: string, data: UserDataPayload): Promise<void> {
  await pool.query(
    `INSERT INTO user_data (user_id, favorites, recents, playlists, prefs, updated_at)
     VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, now())
     ON CONFLICT (user_id) DO UPDATE SET
       favorites = EXCLUDED.favorites,
       recents = EXCLUDED.recents,
       playlists = EXCLUDED.playlists,
       prefs = EXCLUDED.prefs,
       updated_at = now()`,
    [userId, JSON.stringify(data.favorites), JSON.stringify(data.recents), JSON.stringify(data.playlists), JSON.stringify(data.prefs)]
  );
}
