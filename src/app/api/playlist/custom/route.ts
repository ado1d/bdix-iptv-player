/**
 * GET /api/playlist/custom?url=<m3u-url>
 * Fetches and parses a user-added M3U playlist server-side (avoids browser CORS),
 * so users can extend the channel list with their own links.
 * Same guards as the proxy: http(s) only, no private/loopback hosts, size limit.
 * Responses are edge-cached per URL (5 min) like the built-in playlist.
 */
import { NextRequest, NextResponse } from "next/server";
import { parseM3U } from "@/lib/m3u";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 BDIX-TV-Player/1.0";

const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
const MAX_SIZE = 16 * 1024 * 1024; // 16 MB
const MAX_CHANNELS = 8000; // sanity cap — refuse absurd lists

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl || rawUrl.length > 2048) {
    return NextResponse.json({ error: "Missing or oversized url parameter" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!/^https?:$/.test(target.protocol) || BLOCKED_HOST.test(target.hostname)) {
    return NextResponse.json({ error: "Only public http(s) links are supported" }, { status: 400 });
  }

  let text: string;
  try {
    const res = await fetch(target.toString(), {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent": UA,
        Accept: "audio/x-mpegurl, audio/mpegurl, application/vnd.apple.mpegurl, */*",
      },
    });

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json(
        { error: `The playlist link is private or blocked (HTTP ${res.status}). If it needs a username/password, embed them in the URL.` },
        { status: 502 }
      );
    }
    if (!res.ok) {
      return NextResponse.json({ error: `The playlist server responded ${res.status}` }, { status: 502 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json({ error: "Playlist too large (over 16 MB)" }, { status: 502 });
    }
    text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch (err) {
    const reason =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")
        ? "timed out"
        : "unreachable";
    return NextResponse.json({ error: `The playlist link is ${reason}. Double-check the URL.` }, { status: 502 });
  }

  let parsed;
  try {
    parsed = parseM3U(text);
  } catch {
    return NextResponse.json({ error: "Could not parse the playlist" }, { status: 502 });
  }

  const channels = parsed.channels.slice(0, MAX_CHANNELS);
  if (channels.length === 0) {
    return NextResponse.json(
      { error: "No channels found — the link must point to an .m3u / .m3u8 playlist file" },
      { status: 422 }
    );
  }

  return NextResponse.json(
    {
      total: channels.length,
      updatedAt: parsed.updatedAt,
      fetchedAt: new Date().toISOString(),
      channels,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
      },
    }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
