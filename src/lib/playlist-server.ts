/**
 * Server-side playlist loader.
 * - Fetches the M3U from GitHub raw at runtime (so daily updates flow in automatically)
 * - In-memory cache with TTL + ETag revalidation
 * - Falls back to stale cache when GitHub is unreachable
 */
import { buildGroups, parseM3U, type PlaylistData } from "@/lib/m3u";

export const PLAYLIST_URL =
  process.env.M3U_URL ||
  "https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u";

/** Re-fetch at most every 10 minutes per warm server instance */
const MEMORY_TTL_MS = 10 * 60 * 1000;
/** Hard limit on the playlist file we are willing to parse (16 MB) */
const MAX_SIZE = 16 * 1024 * 1024;

let cache: { data: PlaylistData; etag: string | null; fetchedAt: number } | null = null;

export function getCachedPlaylist(): PlaylistData | null {
  return cache?.data ?? null;
}

export async function getPlaylist(force = false): Promise<PlaylistData> {
  const now = Date.now();
  if (!force && cache && now - cache.fetchedAt < MEMORY_TTL_MS) {
    return cache.data;
  }

  try {
    const res = await fetch(PLAYLIST_URL, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: {
        // Be a good citizen to raw.githubusercontent
        "User-Agent": "BDIX-TV-Player/1.0 (+https://github.com)",
        Accept: "audio/x-mpegurl, audio/mpegurl, application/vnd.apple.mpegurl, */*",
        ...(cache?.etag ? { "If-None-Match": cache.etag } : {}),
      },
    });

    if (res.status === 304 && cache) {
      cache.fetchedAt = now;
      return cache.data;
    }

    if (!res.ok) {
      throw new Error(`Source responded ${res.status}`);
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) throw new Error("Playlist too large");

    const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
    const { channels, updatedAt } = parseM3U(text);

    if (channels.length === 0) throw new Error("Empty playlist");

    const data: PlaylistData = {
      total: channels.length,
      updatedAt,
      fetchedAt: new Date().toISOString(),
      sourceUrl: PLAYLIST_URL,
      groups: buildGroups(channels),
      channels,
    };

    cache = {
      data,
      etag: res.headers.get("etag"),
      fetchedAt: now,
    };
    return data;
  } catch (err) {
    // Serve stale data rather than failing hard
    if (cache) return cache.data;
    throw err;
  }
}
