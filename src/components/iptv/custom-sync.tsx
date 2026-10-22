"use client";

/**
 * Renders one invisible sync component per user-added playlist.
 * Each fetches /api/playlist/custom, tags channels with the playlist's
 * id/name and pushes them into the store — merged into the main grid,
 * health-checked and played exactly like the built-in channels.
 * Auto-refreshes every 20 min (and on window focus), so updated
 * playlists flow in automatically, same as the default one.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomPlaylistData } from "@/lib/m3u";
import { useIPTV, type CustomPlaylist } from "@/store/iptv-store";

export function customPlaylistQueryKey(p: CustomPlaylist) {
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
      const res = await fetch(`/api/playlist/custom?url=${encodeURIComponent(playlist.url)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      return body as CustomPlaylistData;
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000, // keep in sync with the source
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
