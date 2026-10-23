import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  ensureSchema,
  getUserData,
  saveUserData,
  listUserFileMeta,
  deleteUserFile,
  type UserDataPayload,
  type PlaylistMeta,
} from "@/lib/auth-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/user/data — the signed-in user's backed-up data */
export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureSchema();
    const data = await getUserData(user.id);
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[user-data:get]", err);
    return NextResponse.json({ error: "Couldn't load your saved data" }, { status: 500 });
  }
}

/* ---------------- PUT payload sanitisation ---------------- */

const MAX_STRINGS = 600;
const MAX_RECENTS = 40;
const MAX_PLAYLISTS = 50;

function cleanStrings(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 200)).slice(0, max);
}

function cleanPlaylists(v: unknown): PlaylistMeta[] {
  if (!Array.isArray(v)) return [];
  const out: PlaylistMeta[] = [];
  for (const item of v.slice(0, MAX_PLAYLISTS)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const kind: "url" | "file" = p.kind === "file" ? "file" : "url";
    const id = typeof p.id === "string" ? p.id.slice(0, 100) : "";
    if (!id) continue;

    if (kind === "file") {
      // File-based playlist: keep only metadata; content lives in user_files.
      const fileId = typeof p.fileId === "string" ? p.fileId.slice(0, 100) : "";
      if (!fileId) continue; // can't reference a file without a fileId
      out.push({
        id,
        name: (typeof p.name === "string" ? p.name : "Uploaded playlist").slice(0, 60) || "Uploaded playlist",
        url: "",
        addedAt: typeof p.addedAt === "number" && Number.isFinite(p.addedAt) ? p.addedAt : Date.now(),
        kind: "file",
        fileId,
      });
    } else {
      // URL-based playlist (legacy default): validate as before.
      const url = typeof p.url === "string" ? p.url : "";
      if (!/^https?:\/\//i.test(url) || url.length > 2000) continue;
      out.push({
        id,
        name: (typeof p.name === "string" ? p.name : "Playlist").slice(0, 60) || "Playlist",
        url,
        addedAt: typeof p.addedAt === "number" && Number.isFinite(p.addedAt) ? p.addedAt : Date.now(),
        kind: "url",
      });
    }
  }
  return out;
}

function cleanPrefs(v: unknown): UserDataPayload["prefs"] {
  if (!v || typeof v !== "object") return {};
  const p = v as Record<string, unknown>;
  const prefs: UserDataPayload["prefs"] = {};
  if (p.playMode === "auto" || p.playMode === "direct" || p.playMode === "proxy") prefs.playMode = p.playMode;
  if (typeof p.autoSkip === "boolean") prefs.autoSkip = p.autoSkip;
  if (typeof p.volume === "number" && p.volume >= 0 && p.volume <= 1) prefs.volume = p.volume;
  if (typeof p.muted === "boolean") prefs.muted = p.muted;
  return prefs;
}

/** PUT /api/user/data — upsert the signed-in user's backed-up data */
export async function PUT(req: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const b = body as Record<string, unknown>;
    const data: UserDataPayload = {
      favorites: cleanStrings(b.favorites, MAX_STRINGS),
      recents: cleanStrings(b.recents, MAX_RECENTS),
      playlists: cleanPlaylists(b.playlists),
      prefs: cleanPrefs(b.prefs),
    };
    await ensureSchema();
    await saveUserData(user.id, data);

    // Garbage-collect orphaned files: any user_files row whose id is no
    // longer referenced by a file-kind playlist is removed. This keeps
    // private user storage from growing unboundedly when files are
    // removed from the playlist list (which happens when the user
    // clicks the trash icon or removes a playlist another way).
    try {
      const referencedFileIds = new Set(
        data.playlists.filter((p) => p.kind === "file" && p.fileId).map((p) => p.fileId as string)
      );
      const allFiles = await listUserFileMeta(user.id);
      for (const f of allFiles) {
        if (!referencedFileIds.has(f.id)) {
          await deleteUserFile(user.id, f.id);
        }
      }
    } catch (gcErr) {
      // GC is best-effort — don't fail the whole save if it errors.
      console.warn("[user-data:put] file GC failed:", gcErr);
    }

    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[user-data:put]", err);
    return NextResponse.json({ error: "Couldn't save your data" }, { status: 500 });
  }
}
