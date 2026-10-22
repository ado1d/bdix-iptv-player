/**
 * GET /api/playlist
 * Returns the parsed channel list. Refreshes from the M3U source automatically
 * (in-memory TTL + edge caching), so daily playlist updates appear without a redeploy.
 * ?refresh=1 — force a fresh fetch from the source.
 */
import { NextRequest, NextResponse } from "next/server";
import { getPlaylist } from "@/lib/playlist-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const data = await getPlaylist(force);
    return NextResponse.json(data, {
      headers: {
        // Edge-cached for 5 min, then revalidated in the background.
        // Combined with the in-memory TTL this keeps things fresh (daily updates)
        // while shielding the origin from repeated parsing.
        "Cache-Control": force
          ? "no-store"
          : "public, s-maxage=300, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[playlist] failed:", err);
    return NextResponse.json(
      {
        error: "Could not load the playlist from the source repository. Please retry.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
