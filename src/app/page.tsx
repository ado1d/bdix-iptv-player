"use client";

/**
 * BDIX TV — main (and only) page.
 * Ties together: playlist auto-sync, progressive status checks, filtering,
 * the sticky player and the channel grid.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, SearchX, Sparkles, TriangleAlert, RefreshCw } from "lucide-react";
import type { PlaylistData } from "@/lib/m3u";
import { useIPTV } from "@/store/iptv-store";
import { statusChecker } from "@/lib/checker";
import { Header } from "@/components/iptv/header";
import { Sidebar, GroupChips } from "@/components/iptv/sidebar";
import { PlayerPanel } from "@/components/iptv/player-panel";
import { CustomPlaylistsSync } from "@/components/iptv/custom-sync";
import { ChannelCard, ChannelCardSkeleton } from "@/components/iptv/channel-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 60;

export default function Home() {
  const queryClient = useQueryClient();
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Hydrate persisted state after mount (avoids SSR mismatch)
  useEffect(() => {
    useIPTV.persist.rehydrate();
  }, []);

  const channels = useIPTV((s) => s.channels);
  const setDefaultPlaylist = useIPTV((s) => s.setDefaultPlaylist);
  const search = useIPTV((s) => s.search);
  const group = useIPTV((s) => s.group);
  const statusFilter = useIPTV((s) => s.statusFilter);
  const specialView = useIPTV((s) => s.specialView);
  const currentId = useIPTV((s) => s.currentId);
  const play = useIPTV((s) => s.play);
  const stop = useIPTV((s) => s.stop);
  const setStatus = useIPTV((s) => s.setStatus);

  // ---------------- Playlist (auto-synced) ----------------
  const playlistQuery = useQuery<PlaylistData>({
    queryKey: ["playlist"],
    queryFn: async () => {
      const res = await fetch("/api/playlist");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Playlist request failed (${res.status})`);
      }
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000, // keep in sync with the source
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (playlistQuery.data) {
      const d = playlistQuery.data;
      setDefaultPlaylist(d.channels, d.updatedAt, d.fetchedAt);
    }
  }, [playlistQuery.data, setDefaultPlaylist]);

  const hardRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/playlist?refresh=1");
      if (!res.ok) throw new Error("refresh failed");
      const d: PlaylistData = await res.json();
      setDefaultPlaylist(d.channels, d.updatedAt, d.fetchedAt);
      queryClient.setQueryData(["playlist"], d);
      statusChecker.clear();
      statusChecker.checkBackground(d.channels.map((c) => c.url));
    } catch {
      // handled by query error state below
    } finally {
      // also refresh every user-added playlist
      queryClient.invalidateQueries({ queryKey: ["custom-playlist"] });
    }
  }, [queryClient, setDefaultPlaylist]);

  // ---------------- Status checker wiring ----------------
  useEffect(() => {
    statusChecker.configure(
      (url, info) => setStatus(url, info),
      (url) => {
        const s = useIPTV.getState().statuses[url];
        return Boolean(s && Date.now() - s.checkedAt < 30 * 60 * 1000);
      }
    );
  }, [setStatus]);

  // Background sweep over the whole playlist (visible items jump the queue)
  useEffect(() => {
    if (channels.length === 0) return;
    const t = setTimeout(() => {
      statusChecker.checkBackground(channels.map((c) => c.url));
    }, 1200);
    return () => clearTimeout(t);
  }, [channels]);

  // ---------------- Derived data ----------------
  const channelsById = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);

  const statuses = useIPTV((s) => s.statuses);
  const counts = useMemo(() => {
    let online = 0;
    let offline = 0;
    for (const c of channels) {
      const s = statuses[c.url];
      if (!s) continue;
      if (s.status === "online") online++;
      else offline++;
    }
    return { online, offline, checked: online + offline };
  }, [channels, statuses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = channels;

    if (specialView === "favorites") {
      const favs = useIPTV.getState().favorites;
      const favSet = new Set(favs);
      list = list.filter((c) => favSet.has(c.id));
    } else if (specialView === "recents") {
      const rec = useIPTV.getState().recents;
      const map = new Map(channels.map((c) => [c.id, c]));
      list = rec.map((id) => map.get(id)).filter((c): c is NonNullable<typeof c> => Boolean(c));
    } else if (specialView === "custom") {
      list = list.filter((c) => c.sourceId);
    }

    if (group && specialView === "all") {
      list = list.filter((c) => c.group === group);
    }
    if (q) {
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter((c) => statuses[c.url]?.status === statusFilter);
    }
    return list;
  }, [channels, search, group, statusFilter, specialView, statuses]);

  const current = currentId ? channelsById.get(currentId) ?? null : null;

  // ---------------- Infinite scroll ----------------
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [search, group, statusFilter, specialView]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setLimit((l) => (l < filtered.length ? l + PAGE_SIZE : l));
        }
      },
      { rootMargin: "900px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filtered.length]);

  // ---------------- Channel zapping ----------------
  const zapListRef = useRef<Channel_[]>([]);
  zapListRef.current = filtered.length > 0 ? filtered : channels;

  const switchChannel = useCallback(
    (delta: 1 | -1) => {
      const list = zapListRef.current;
      if (list.length === 0) return;
      const idx = list.findIndex((c) => c.id === currentId);
      const nextIdx = idx === -1 ? (delta === 1 ? 0 : list.length - 1) : (idx + delta + list.length) % list.length;
      play(list[nextIdx].id);
    },
    [currentId, play]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        if (e.key === "Escape") target.blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && currentId) {
        // Close the player unless a dialog is open or we're just leaving fullscreen
        if (!document.querySelector("[role=\"dialog\"]") && !document.fullscreenElement) {
          stop();
        }
      } else if (e.key === "ArrowRight" && currentId) {
        switchChannel(1);
      } else if (e.key === "ArrowLeft" && currentId) {
        switchChannel(-1);
      } else if (e.key === "m" || e.key === "M") {
        const st = useIPTV.getState();
        st.setMuted(!st.muted);
      } else if (e.key === "f" || e.key === "F") {
        const el = document.querySelector("[data-player-container]") as HTMLElement | null;
        if (el) {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else el.requestFullscreen().catch(() => {});
        }
      } else if (e.key === " " && currentId) {
        e.preventDefault();
        const video = document.querySelector("video") as HTMLVideoElement | null;
        if (video) {
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentId, switchChannel, stop]);

  const surprise = useCallback(() => {
    const online = channels.filter((c) => statuses[c.url]?.status === "online");
    const pool = online.length > 0 ? online : channels;
    if (pool.length === 0) return;
    play(pool[Math.floor(Math.random() * pool.length)].id);
  }, [channels, statuses, play]);

  const loading = playlistQuery.isLoading;
  const error = playlistQuery.error as Error | null;

  // ---------------- Render ----------------
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <Header refreshing={playlistQuery.isFetching && !loading} onRefresh={hardRefresh} searchRef={searchRef} />

      {/* Keeps every user-added playlist in sync (invisible) */}
      <CustomPlaylistsSync />

      <div className="mx-auto flex w-full max-w-[1700px] flex-1">
        <Sidebar channelsById={channelsById} />

        <main className="min-w-0 flex-1 px-3 sm:px-5 py-4 flex flex-col gap-4">
          {/* Error state */}
          {error && !loading && channels.length === 0 && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-10 text-center">
              <TriangleAlert className="w-10 h-10 text-rose-500" />
              <div>
                <p className="font-semibold">Couldn&apos;t load the channel list</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                  {error.message}. The playlist source may be temporarily unavailable.
                </p>
              </div>
              <Button onClick={() => playlistQuery.refetch()} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                <RefreshCw className="w-4 h-4 mr-2" /> Try again
              </Button>
            </div>
          )}

          {/* Player / hero */}
          {current ? (
            <PlayerPanel
              channel={current}
              visibleChannels={filtered.length > 0 ? filtered : channels}
              onPrev={() => switchChannel(-1)}
              onNext={() => switchChannel(1)}
            />
          ) : (
            !error && (
              <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-teal-500/[0.06] p-5 sm:p-7">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                  <div className="min-w-0">
                    <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                      {loading ? "Loading channels…" : `${channels.length} live channels, ready to play`}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                      Channel list auto-syncs with the Mrgify BDIX playlist every day — and you can add
                      your own M3U playlists from Settings. Pick a channel —{" "}
                      <span className="hidden sm:inline">zap with ← / → — </span>
                      or let fate decide.
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      onClick={surprise}
                      disabled={channels.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/25"
                    >
                      <Sparkles className="w-4 h-4 mr-2" /> Play something
                    </Button>
                  </div>
                </div>
                {channels.length > 0 && counts.checked > 0 && (
                  <p className="mt-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                    Status check in progress — {counts.checked}/{channels.length} checked · {counts.online} working so far.
                    Keep the app open and statuses keep filling in.
                  </p>
                )}
              </section>
            )
          )}

          {/* Filter chips */}
          {channels.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <GroupChips />
              <div className="flex items-center gap-2" role="tablist" aria-label="Stream status filter">
                <StatusChip
                  active={statusFilter === "all"}
                  onClick={() => useIPTV.getState().setStatusFilter("all")}
                  label="All"
                  count={filtered.length}
                  total={channels.length}
                />
                <StatusChip
                  active={statusFilter === "online"}
                  onClick={() => useIPTV.getState().setStatusFilter("online")}
                  label="Working"
                  count={counts.online}
                  tone="emerald"
                />
                <StatusChip
                  active={statusFilter === "offline"}
                  onClick={() => useIPTV.getState().setStatusFilter("offline")}
                  label="Down"
                  count={counts.offline}
                  tone="rose"
                />
                <span className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                  <ArrowLeftRight className="w-3 h-3" /> statuses checked from our servers, updated automatically
                </span>
              </div>
            </div>
          )}

          {/* Channel grid */}
          {loading ? (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <ChannelCardSkeleton key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center">
              <SearchX className="w-8 h-8 text-zinc-400" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {specialView === "favorites" && "No favorites yet — tap the heart on any channel."
                  || specialView === "recents" && "Nothing watched yet."
                  || specialView === "custom" && "No channels from your own playlists yet — add an M3U link in Settings."
                  || statusFilter === "online" && "No channels confirmed working yet — the check is still running."
                  || statusFilter === "offline" && "No dead channels found (yet)."
                  || "No channels match your search."}
              </p>
              {(search || group || statusFilter !== "all" || specialView !== "all") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const st = useIPTV.getState();
                    st.setSearch("");
                    st.setGroup(null);
                    st.setStatusFilter("all");
                    st.setSpecialView("all");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 pb-2">
              {filtered.slice(0, limit).map((c, i) => (
                <ChannelCard key={c.id} channel={c} index={i} />
              ))}
            </div>
          )}
          <div ref={sentinelRef} aria-hidden className="h-1" />
        </main>
      </div>

      <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-[1700px] px-4 sm:px-6 py-4 flex flex-col sm:flex-row gap-2 sm:items-center justify-between text-[11px] text-zinc-400 dark:text-zinc-500">
          <p>
            BDIX TV is a player, not a broadcaster — all streams come from the{" "}
            <a
              href="https://github.com/abusaeeidx/Mrgify-BDIX-IPTV"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-emerald-500"
            >
              Mrgify BDIX IPTV
            </a>{" "}
            playlist and belong to their respective owners.
          </p>
          <p className="shrink-0">Statuses are auto-checked from our servers · some BDIX-only streams may still work on local connections</p>
        </div>
      </footer>
    </div>
  );
}

type Channel_ = import("@/lib/m3u").Channel;

function StatusChip({
  active,
  onClick,
  label,
  count,
  tone,
  total,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "emerald" | "rose";
  total?: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
        active
          ? tone === "emerald"
            ? "bg-emerald-600 text-white border-emerald-600"
            : tone === "rose"
              ? "bg-rose-600 text-white border-rose-600"
              : "bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white"
          : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-emerald-500/40"
      )}
    >
      {label}
      <span className="ml-1.5 tabular-nums opacity-70">
        {count}
        {total !== undefined ? `/${total}` : ""}
      </span>
    </button>
  );
}
