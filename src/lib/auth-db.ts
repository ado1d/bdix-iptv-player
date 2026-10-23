/**
 * PostgreSQL pool (Neon Postgres via Vercel storage) + schema bootstrap for
 * accounts & user-data sync.
 *
 * Tables:
 *  - users:        id, email (unique), name, password_hash, timestamps
 *  - user_data:    one row per user — favorites / recents / playlists / prefs (JSONB)
 *  - user_files:   user-uploaded M3U files (private to each user — privacy boundary)
 *
 * The pool is stored on globalThis so Next.js hot reloads / serverless warm
 * instances reuse connections instead of opening new ones.
 */
import { Pool } from "pg";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

// Managed Postgres providers (Neon, etc.) require TLS with provider-managed
// certificate chains; only plain local dev runs without TLS.
function tlsFor(url: string | undefined): { rejectUnauthorized: boolean } | undefined {
  try {
    const host = new URL(url ?? "").hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return undefined;
  } catch {
    /* fall through to TLS */
  }
  return { rejectUnauthorized: false };
}

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.AUTH_DATABASE_URL,
    ssl: tlsFor(process.env.AUTH_DATABASE_URL),
    max: 3, // keep well under the provider's pooled-connection limits
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
      // User-uploaded M3U files — content is stored privately per user.
      // The user_id FK with ON DELETE CASCADE ensures files are removed
      // automatically when a user is deleted, so nothing leaks across users.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_files (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          size INTEGER NOT NULL,
          channel_count INTEGER NOT NULL DEFAULT 0,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_user_files_user ON user_files(user_id)`
      );
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
  /** For url playlists: the M3U URL. For file playlists: empty string — content lives in user_files */
  url: string;
  addedAt: number;
  /** "url" (link-based) or "file" (uploaded) — defaults to "url" for back-compat with old rows */
  kind?: "url" | "file";
  /** For file playlists: the id of the row in user_files. Always paired with kind="file" */
  fileId?: string;
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

/* ---------------- user-uploaded M3U files (privacy boundary) ----------------
 *
 * All access is scoped to the authenticated user's id. There is no
 * "list-all-files" or "get-by-id-only" path — every read/delete must
 * pass the caller's userId and the query includes `WHERE user_id = $1`,
 * so one user can never read another user's file content or even its
 * metadata. Files are also removed automatically when the owning user
 * is deleted (FK CASCADE).
 */

export interface UserFileRow {
  id: string;
  user_id: string;
  name: string;
  size: number;
  channel_count: number;
  content: string;
  created_at: string;
}

export interface UserFileMeta {
  id: string;
  name: string;
  size: number;
  channelCount: number;
  createdAt: string;
}

/** Store an uploaded M3U file's content under the owning user. */
export async function saveUserFile(
  userId: string,
  fileId: string,
  name: string,
  content: string,
  channelCount: number
): Promise<void> {
  await pool.query(
    `INSERT INTO user_files (id, user_id, name, size, channel_count, content)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [fileId, userId, name, content.length, channelCount, content]
  );
}

/**
 * Get an uploaded file's full content. Always scoped by user_id, so a
 * caller can only ever fetch their own files. Returns null if the file
 * does not exist OR belongs to a different user (no leakage / no
 * existence-disclosure).
 */
export async function getUserFileContent(
  userId: string,
  fileId: string
): Promise<{ content: string; name: string; channelCount: number } | null> {
  const { rows } = await pool.query(
    `SELECT content, name, channel_count FROM user_files
     WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [fileId, userId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return { content: r.content, name: r.name, channelCount: r.channel_count };
}

/** Delete an uploaded file. No-op if the file is not owned by the caller. */
export async function deleteUserFile(userId: string, fileId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM user_files WHERE id = $1 AND user_id = $2`,
    [fileId, userId]
  );
  return (rowCount ?? 0) > 0;
}

/** Lightweight metadata-only listing for the settings page (no content). */
export async function listUserFileMeta(userId: string): Promise<UserFileMeta[]> {
  const { rows } = await pool.query(
    `SELECT id, name, size, channel_count,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM user_files WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    size: r.size,
    channelCount: r.channel_count,
    createdAt: r.created_at,
  }));
}
