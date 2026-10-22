/**
 * GET /api/proxy?url=<stream-url>
 * CORS / mixed-content stream proxy:
 *  - .m3u8 playlists are rewritten so every nested URL also flows through the proxy
 *  - binary segments are streamed through untouched
 *  - Range headers are forwarded (seek support)
 * Runs on the Node.js runtime (Vercel's Edge runtime blocks direct-IP URLs,
 * which many BDIX streams use).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 BDIX-TV-Player/1.0";

const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
  };
}

function toProxyUrl(uri: string, baseUrl: string): string {
  try {
    const abs = new URL(uri, baseUrl).toString();
    return `/api/proxy?url=${encodeURIComponent(abs)}`;
  } catch {
    return uri;
  }
}

/** Rewrite every URL inside an HLS manifest to route through the proxy */
function rewriteManifest(text: string, baseUrl: string): string {
  return text
    .split("\n")
    .map((raw) => {
      const line = raw.trim();
      if (!line) return raw;
      if (line.startsWith("#")) {
        // Rewrite URI="…" attributes (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-I-FRAME…)
        if (line.includes('URI="')) {
          return raw.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${toProxyUrl(uri, baseUrl)}"`);
        }
        return raw;
      }
      return toProxyUrl(line, baseUrl);
    })
    .join("\n");
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl || rawUrl.length > 2048) {
    return NextResponse.json({ error: "Missing or oversized url parameter" }, { status: 400, headers: corsHeaders() });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400, headers: corsHeaders() });
  }

  if (!/^https?:$/.test(target.protocol) || BLOCKED_HOST.test(target.hostname)) {
    return NextResponse.json({ error: "Unsupported target" }, { status: 400, headers: corsHeaders() });
  }

  const range = req.headers.get("range");

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        ...(range ? { Range: range } : {}),
      },
    });
  } catch (err) {
    const reason = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError") ? "timeout" : "unreachable";
    return NextResponse.json(
      { error: `Upstream ${reason}` },
      { status: 502, headers: corsHeaders() }
    );
  }

  const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
  const isManifest =
    contentType.includes("mpegurl") ||
    (!contentType && /\.m3u8?($|\?)/i.test(target.pathname)) ||
    (!contentType && upstream.url.includes(".m3u8"));

  const headers = new Headers(corsHeaders());
  headers.set("Cache-Control", "no-store");

  if (isManifest) {
    let body: string;
    try {
      body = await upstream.text();
    } catch {
      return NextResponse.json({ error: "Failed to read manifest" }, { status: 502, headers: corsHeaders() });
    }
    const rewritten = rewriteManifest(body, upstream.url || target.toString());
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    return new NextResponse(rewritten, { status: upstream.status, headers });
  }

  // Binary passthrough (TS/fMP4 segments, keys, images, audio…)
  const passThrough = ["content-type", "content-length", "content-range", "accept-ranges"];
  for (const h of passThrough) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  return new NextResponse(upstream.body, { status: upstream.status, headers });
}

export async function HEAD(req: NextRequest) {
  const res = await GET(req);
  return new NextResponse(null, { status: res.status, headers: res.headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
