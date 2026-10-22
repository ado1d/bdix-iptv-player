/**
 * GET /api/check?url=<stream-url>
 * Health-checks a single stream from the server:
 *  - HTTP status must be 2xx
 *  - m3u8 responses must actually contain #EXTM3U (catches fake-200 error pages)
 *  - HTML responses are treated as dead links
 * Responses are edge-cached (s-maxage) per URL so repeat visitors don't
 * re-trigger upstream checks.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 BDIX-TV-Player/1.0";

const TIMEOUT_MS = 9_000;

interface CheckResult {
  status: "online" | "offline";
  httpCode: number | null;
  latencyMs: number;
  contentType: string;
  reason: string;
  checkedAt: string;
}

async function checkStream(url: string): Promise<CheckResult> {
  const started = Date.now();
  const base = {
    latencyMs: 0,
    contentType: "",
    checkedAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        // Avoid downloading entire VOD files when the URL is not a manifest
        Range: "bytes=0-65535",
      },
    });

    const latencyMs = Date.now() - started;
    const contentType = (res.headers.get("content-type") || "").toLowerCase();

    if (!res.ok) {
      return {
        ...base,
        status: "offline",
        httpCode: res.status,
        latencyMs,
        contentType,
        reason: `HTTP ${res.status}`,
      };
    }

    // Manifest: verify the body really is a playlist
    const looksLikePlaylist =
      contentType.includes("mpegurl") || /\.m3u8?($|\?)/i.test(url);

    if (looksLikePlaylist && !contentType.includes("html")) {
      const text = await res.text();
      if (text.includes("#EXTM3U")) {
        return { ...base, status: "online", httpCode: res.status, latencyMs, contentType, reason: "ok" };
      }
      return {
        ...base,
        status: "offline",
        httpCode: res.status,
        latencyMs,
        contentType,
        reason: "invalid playlist",
      };
    }

    // Some servers return HTML error pages with 200
    if (contentType.includes("text/html")) {
      return { ...base, status: "offline", httpCode: res.status, latencyMs, contentType, reason: "error page" };
    }

    // Video/audio segment or stream — 2xx is good enough
    return { ...base, status: "online", httpCode: res.status, latencyMs, contentType, reason: "ok" };
  } catch (err) {
    const latencyMs = Date.now() - started;
    let reason = "unreachable";
    if (err instanceof Error) {
      if (err.name === "TimeoutError" || err.name === "AbortError") reason = "timeout";
      else if (err.message?.includes("ENOTFOUND") || err.message?.includes("getaddrinfo")) reason = "dns error";
      else if (err.message?.includes("certificate")) reason = "tls error";
    }
    return { ...base, status: "offline", httpCode: null, latencyMs, contentType: "", reason };
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "Only http(s) urls are supported" }, { status: 400 });
  }

  const result = await checkStream(parsed.toString());
  return NextResponse.json(result, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      // Cache the verdict at the edge for 30 min, serve stale while revalidating
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
}
