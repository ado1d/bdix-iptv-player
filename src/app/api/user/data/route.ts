import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureSchema, getUserData, saveUserData, type UserDataPayload, type PlaylistMeta } from "@/lib/auth-db";

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
    const url = typeof p.url === "string" ? p.url : "";
    if (!/^https?:\/\//i.test(url) || url.length > 2000) continue;
    out.push({
      id: typeof p.id === "string" ? p.id.slice(0, 100) : "",
      name: (typeof p.name === "string" ? p.name : "Playlist").slice(0, 60) || "Playlist",
      url,
      addedAt: typeof p.addedAt === "number" && Number.isFinite(p.addedAt) ? p.addedAt : Date.now(),
    });
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
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[user-data:put]", err);
    return NextResponse.json({ error: "Couldn't save your data" }, { status: 500 });
  }
}
