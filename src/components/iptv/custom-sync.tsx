"use client";

/**
 * Renders one invisible sync component per user-added playlist.
 * Each fetches its channels (URL playlists from /api/playlist/custom,
 * uploaded files from /api/playlist/upload), tags them with the
 * playlist's id/name and pushes them into the store — merged into the
 * main grid, health-checked and played exactly like the built-in channels.
 * Auto-refreshes every 20 min (and on window focus), so updated
 * playlists flow in automatically, same as the default one.
 *
 * For uploaded files: the response is private per-user (server checks
 * the session), so a user can only ever fetch their own uploaded file's
 * channels — never another user's.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomPlaylistData } from "@/lib/m3u";
import { useIPTV, type CustomPlaylist } from "@/store/iptv-store";

export function customPlaylistQueryKey(p: CustomPlaylist) {
  // File-based playlists use the server-side fileId in the query key so
  // uploads with the same URL-hash can't collide. (id is already unique
  // via the "file_" prefix, but including fileId makes intent clear.)
  if (p.kind === "file" && p.fileId) {
    return ["custom-playlist", p.id, "file", p.fileId] as const;
  }
  return ["custom-playlist", p.id, p.url] as const;
}

export function CustomPlaylistsSync() {
  const playlists = useIPTV((s) => s.customPlaylists);
  return (
    <>
      {playlists.map((p) => (
        <CustomPlaylistSync key={p.id} playlist={p} />
      ))}
    </>
  );
}

function CustomPlaylistSync({ playlist }: { playlist: CustomPlaylist }) {
  const queryClient = useQueryClient();
  const setCustomChannels = useIPTV((s) => s.setCustomChannels);
  const setCustomStatus = useIPTV((s) => s.setCustomStatus);

  const query = useQuery<CustomPlaylistData>({
    queryKey: customPlaylistQueryKey(playlist),
    queryFn: async () => {
      let res: Response;
      if (playlist.kind === "file" && playlist.fileId) {
        // Uploaded file — fetch parsed channels from the per-user storage.
        res = await fetch(`/api/playlist/upload?id=${encodeURIComponent(playlist.fileId)}`);
      } else {
        // URL-based playlist — fetch + parse server-side (avoids browser CORS).
        res = await fetch(`/api/playlist/custom?url=${encodeURIComponent(playlist.url)}`);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return body as CustomPlaylistData;
    },
    // Uploaded files don't change on the server, so we can keep them
    // fresh for longer than URL playlists. URL playlists stay at 2 min.
    staleTime: playlist.kind === "file" ? 60 * 60 * 1000 : 2 * 60 * 1000,
    refetchInterval: playlist.kind === "file" ? false : 20 * 60 * 1000,
    retry: 1,
  });

  // Reflect loading / error state for the Settings dialog
  useEffect(() => {
    setCustomStatus(playlist.id, {
      loading: query.isFetching && !query.data,
      error: query.error instanceof Error ? query.error.message : null,
    });
  }, [query.isFetching, query.data, query.error, playlist.id, setCustomStatus]);

  // Push fetched channels (tagged with their source) into the merged store
  useEffect(() => {
    if (!query.data) return;
    setCustomStatus(playlist.id, {
      count: query.data.total,
      fetchedAt: query.data.fetchedAt,
      updatedAt: query.data.updatedAt,
      loading: false,
      error: null,
    });
    setCustomChannels(
      playlist.id,
      query.data.channels.map((c) => ({ ...c, sourceId: playlist.id, sourceName: playlist.name }))
    );
  }, [query.data, playlist.id, playlist.name, setCustomChannels, setCustomStatus]);

  // Expose a retry helper for the settings dialog
  useEffect(() => {
    const handler = () => queryClient.invalidateQueries({ queryKey: customPlaylistQueryKey(playlist) });
    window.addEventListener(`retry-playlist-${playlist.id}`, handler);
    return () => window.removeEventListener(`retry-playlist-${playlist.id}`, handler);
  }, [queryClient, playlist]);

  return null;
}
