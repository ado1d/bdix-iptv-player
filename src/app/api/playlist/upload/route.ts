/**
 * /api/playlist/upload
 *
 * User-uploaded M3U / M3U8 files — stored privately per user. This is the
 * privacy boundary: every read, write, and delete is scoped by the
 * authenticated session's user_id, and the underlying queries always
 * `WHERE user_id = $1`, so one user can NEVER see another user's file
 * content or even its metadata.
 *
 *   POST   multipart/form-data { file, name? }   → { id, name, count, ... }
 *   GET    ?id=<fileId>                          → parsed channels (owner only)
 *   DELETE ?id=<fileId>                          → removes the file (owner only)
 *
 * Validation:
 *  - 16 MB size limit
 *  - must start with #EXTM3U (after BOM/whitespace strip)
 *  - sane MIME / extension hints (m3u, m3u8, audio/x-mpegurl, text/plain)
 *  - sane channel count cap (8000)
 *
 * The returned `id` is a crypto.randomUUID used as the file's primary key.
 * It is not predictable or enumerable, but even if leaked, the ownership
 * check still blocks non-owners.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ensureSchema, saveUserFile, getUserFileContent, deleteUserFile } from "@/lib/auth-db";
import { parseM3U, type Channel } from "@/lib/m3u";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 16 * 1024 * 1024; // 16 MB — same cap as the URL fetch path
const MAX_CHANNELS = 8000;
const MAX_NAME_LEN = 60;

/** Accept both .m3u / .m3u8 file extensions and common text/playlist MIMEs */
function looksLikeM3U(filename: string, mime: string | null): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "m3u" || ext === "m3u8") return true;
  if (mime) {
    const m = mime.toLowerCase();
    if (
      m === "audio/x-mpegurl" ||
      m === "audio/mpegurl" ||
      m === "application/vnd.apple.mpegurl" ||
      m === "application/x-mpegurl" ||
      m === "text/plain"
    ) {
      return true;
    }
  }
  return false;
}

/** Strip BOM + leading whitespace, then check for the M3U header */
function startsWithExtm3u(content: string): boolean {
  const trimmed = content.replace(/^\uFEFF/, "").trimStart();
  // First non-empty line should be #EXTM3U (or at least #EXTINF for tolerant playlists)
  const firstLine = trimmed.split(/\r?\n/, 1)[0] ?? "";
  return /^#EXTM3U/i.test(firstLine) || /^#EXTINF/i.test(firstLine);
}

/** POST /api/playlist/upload — store an M3U file under the signed-in user. */
export async function POST(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload M3U files" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data with a file field" }, { status: 400 });
  }

  const file = formData.get("file");
  const nameRaw = formData.get("name");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The file is empty" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large — keep it under 16 MB" }, { status: 413 });
  }
  if (!looksLikeM3U(file.name, file.type)) {
    return NextResponse.json(
      { error: "Only .m3u or .m3u8 playlist files are supported" },
      { status: 415 }
    );
  }

  let text: string;
  try {
    const buf = await file.arrayBuffer();
    text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return NextResponse.json({ error: "Could not decode the file as UTF-8 text" }, { status: 400 });
  }

  if (!startsWithExtm3u(text)) {
    return NextResponse.json(
      { error: "The file doesn't look like an M3U playlist (must start with #EXTM3U)" },
      { status: 422 }
    );
  }

  let parsed: { channels: Channel[]; updatedAt: string | null };
  try {
    parsed = parseM3U(text);
  } catch {
    return NextResponse.json({ error: "Could not parse the M3U file" }, { status: 422 });
  }
  const channels = parsed.channels.slice(0, MAX_CHANNELS);
  if (channels.length === 0) {
    return NextResponse.json({ error: "No channels found in the file" }, { status: 422 });
  }

  // Friendly default name from the file name (strip extension)
  const baseName =
    (typeof nameRaw === "string" ? nameRaw.trim() : "") ||
    file.name.replace(/\.(m3u8?|M3U8?)$/i, "").trim() ||
    "Uploaded playlist";
  const finalName = baseName.slice(0, MAX_NAME_LEN);

  // Use the existing Postgres gen_random_uuid() via the pool for the file id,
  // so ids are unpredictable even if leaked. The store prefixes this with
  // "file_" for the local playlist id to avoid collisions with URL-derived ids.
  let fileId: string;
  try {
    await ensureSchema();
    // Inline UUID generation — avoids importing a uuid lib server-side
    // (the `uuid` package is already a dep, but crypto.randomUUID is built-in
    // on Node 19+/Next 16 runtimes and equally unpredictable).
    fileId = (globalThis.crypto ?? (await import("crypto")).webcrypto).randomUUID();
  } catch (err) {
    console.error("[playlist-upload] uuid/ensureSchema failed:", err);
    return NextResponse.json({ error: "Server not ready, try again" }, { status: 500 });
  }

  try {
    await saveUserFile(user.id, fileId, finalName, text, channels.length);
  } catch (err) {
    console.error("[playlist-upload] saveUserFile failed:", err);
    return NextResponse.json({ error: "Couldn't save your file — try again" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: fileId,
      name: finalName,
      count: channels.length,
      updatedAt: parsed.updatedAt,
      size: text.length,
      savedAt: new Date().toISOString(),
    },
    {
      headers: {
        // File content is private — never cache responses from this endpoint.
        "Cache-Control": "no-store",
      },
    }
  );
}

/**
 * GET /api/playlist/upload?id=<fileId> — return parsed channels for the
 * authenticated owner. Non-owners get a 404 (so existence isn't disclosed).
 */
export async function GET(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to view this playlist" }, { status: 401 });
  }
  const fileId = req.nextUrl.searchParams.get("id");
  if (!fileId || fileId.length > 100) {
    return NextResponse.json({ error: "Missing or invalid file id" }, { status: 400 });
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error("[playlist-upload:get] ensureSchema failed:", err);
    return NextResponse.json({ error: "Server not ready" }, { status: 500 });
  }

  const row = await getUserFileContent(user.id, fileId);
  if (!row) {
    // 404 for both "doesn't exist" and "not yours" — no existence-disclosure
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  let parsed: { channels: Channel[]; updatedAt: string | null };
  try {
    parsed = parseM3U(row.content);
  } catch {
    return NextResponse.json({ error: "Could not parse the stored playlist" }, { status: 500 });
  }
  const channels = parsed.channels.slice(0, MAX_CHANNELS);

  return NextResponse.json(
    {
      id: fileId,
      name: row.name,
      total: channels.length,
      channelCount: row.channelCount,
      updatedAt: parsed.updatedAt,
      fetchedAt: new Date().toISOString(),
      channels,
    },
    {
      headers: {
        // Per-user private content — never cache or share.
        "Cache-Control": "no-store",
      },
    }
  );
}

/**
 * DELETE /api/playlist/upload?id=<fileId> — remove the file from the
 * owning user's storage. No-op (returns 404) if the file isn't theirs.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to remove this playlist" }, { status: 401 });
  }
  const fileId = req.nextUrl.searchParams.get("id");
  if (!fileId || fileId.length > 100) {
    return NextResponse.json({ error: "Missing or invalid file id" }, { status: 400 });
  }

  try {
    await ensureSchema();
  } catch (err) {
    console.error("[playlist-upload:delete] ensureSchema failed:", err);
    return NextResponse.json({ error: "Server not ready" }, { status: 500 });
  }

  const ok = await deleteUserFile(user.id, fileId);
  if (!ok) {
    // Same response whether it didn't exist or wasn't theirs — no leakage.
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, id: fileId },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    },
  });
}
