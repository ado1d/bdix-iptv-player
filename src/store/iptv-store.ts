"use client";

/**
 * Global app state (Zustand + localStorage persistence).
 * Statuses are keyed by stream URL so they survive playlist refreshes.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Channel, GroupInfo } from "@/lib/m3u";

export type StatusFilter = "all" | "online" | "offline";
export type PlayMode = "auto" | "direct" | "proxy";
export type SpecialView = "all" | "favorites" | "recents";

export interface StatusInfo {
  status: "online" | "offline";
  checkedAt: number; // epoch ms
  httpCode?: number | null;
  reason?: string;
  latencyMs?: number;
}

const STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000; // drop cached statuses older than 6h

interface IPTVState {
  // ---- playlist data (not persisted; fetched at runtime) ----
  channels: Channel[];
  groups: GroupInfo[];
  playlistUpdatedAt: string | null;
  playlistFetchedAt: string | null;

  // ---- filters ----
  search: string;
  group: string | null;
  statusFilter: StatusFilter;
  specialView: SpecialView;

  // ---- statuses (persisted, keyed by url) ----
  statuses: Record<string, StatusInfo>;

  // ---- playback ----
  currentId: string | null;
  playMode: PlayMode;
  volume: number;
  muted: boolean;
  autoSkip: boolean;
  hostModes: Record<string, "direct" | "proxy">;

  // ---- user collections ----
  favorites: string[];
  recents: string[]; // channel ids, newest first

  // ---- actions ----
  setPlaylist: (channels: Channel[], groups: GroupInfo[], updatedAt: string | null, fetchedAt: string | null) => void;
  setSearch: (s: string) => void;
  setGroup: (g: string | null) => void;
  setStatusFilter: (f: StatusFilter) => void;
  setSpecialView: (v: SpecialView) => void;
  setStatus: (url: string, info: StatusInfo) => void;
  setStatuses: (entries: Record<string, StatusInfo>) => void;
  play: (id: string) => void;
  stop: () => void;
  toggleFavorite: (id: string) => void;
  isFavorite: (id: string) => boolean;
  setPlayMode: (m: PlayMode) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
  setAutoSkip: (v: boolean) => void;
  rememberHostMode: (host: string, mode: "direct" | "proxy") => void;
}

export const useIPTV = create<IPTVState>()(
  persist(
    (set, get) => ({
      channels: [],
      groups: [],
      playlistUpdatedAt: null,
      playlistFetchedAt: null,

      search: "",
      group: null,
      statusFilter: "all",
      specialView: "all",

      statuses: {},

      currentId: null,
      playMode: "auto",
      volume: 1,
      muted: false,
      autoSkip: false,
      hostModes: {},

      favorites: [],
      recents: [],

      setPlaylist: (channels, groups, updatedAt, fetchedAt) =>
        set({
          channels,
          groups,
          playlistUpdatedAt: updatedAt,
          playlistFetchedAt: fetchedAt,
          // drop statuses for channels that no longer exist
          statuses: (() => {
            const valid = new Set(channels.map((c) => c.url));
            const now = Date.now();
            const out: Record<string, StatusInfo> = {};
            for (const [url, info] of Object.entries(get().statuses)) {
              if (valid.has(url) && now - info.checkedAt < STATUS_MAX_AGE_MS) out[url] = info;
            }
            return out;
          })(),
        }),

      setSearch: (s) => set({ search: s }),
      setGroup: (g) => set({ group: g, specialView: "all" }),
      setStatusFilter: (f) => set({ statusFilter: f }),
      setSpecialView: (v) => set({ specialView: v, group: null }),

      setStatus: (url, info) =>
        set((st) => ({ statuses: { ...st.statuses, [url]: info } })),

      setStatuses: (entries) =>
        set((st) => ({ statuses: { ...st.statuses, ...entries } })),

      play: (id) =>
        set((st) => ({
          currentId: id,
          recents: [id, ...st.recents.filter((r) => r !== id)].slice(0, 30),
        })),

      stop: () => set({ currentId: null }),

      toggleFavorite: (id) =>
        set((st) => ({
          favorites: st.favorites.includes(id)
            ? st.favorites.filter((f) => f !== id)
            : [id, ...st.favorites].slice(0, 200),
        })),

      isFavorite: (id) => get().favorites.includes(id),

      setPlayMode: (m) => set({ playMode: m }),
      setVolume: (v) => set({ volume: v, muted: v === 0 }),
      setMuted: (m) => set({ muted: m }),
      setAutoSkip: (v) => set({ autoSkip: v }),

      rememberHostMode: (host, mode) =>
        set((st) => ({ hostModes: { ...st.hostModes, [host]: mode } })),
    }),
    {
      name: "bdix-tv-v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true, // avoid SSR hydration mismatch; rehydrated in a mount effect
      partialize: (st) => ({
        statuses: st.statuses,
        favorites: st.favorites,
        recents: st.recents,
        hostModes: st.hostModes,
        playMode: st.playMode,
        volume: st.volume,
        muted: st.muted,
        autoSkip: st.autoSkip,
      }),
    }
  )
);
