"use client";

/**
 * Global app state (Zustand + localStorage persistence).
 * Statuses are keyed by stream URL so they survive playlist refreshes.
 *
 * Playlist model:
 *  - defaultChannels: the built-in Mrgify BDIX playlist (runtime, auto-synced)
 *  - customPlaylists: user-added M3U links (metadata persisted)
 *  - customChannels: channels of each custom playlist (runtime, auto-synced)
 *  - channels: merged view (default first, custom after, deduped by URL)
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { buildGroups, hashId, type Channel, type GroupInfo } from "@/lib/m3u";

export type StatusFilter = "all" | "online" | "offline";
export type PlayMode = "auto" | "direct" | "proxy";
export type SpecialView = "all" | "favorites" | "recents" | "custom";

export interface StatusInfo {
  status: "online" | "offline";
  checkedAt: number; // epoch ms
  httpCode?: number | null;
  reason?: string;
  latencyMs?: number;
}

/** A user-added M3U playlist (metadata only — channels are fetched at runtime) */
export interface CustomPlaylist {
  /** Stable id derived from the URL (re-adding the same URL is a no-op) */
  id: string;
  name: string;
  url: string;
  addedAt: number;
}

/** Runtime sync status of a custom playlist (shown in Settings) */
export interface CustomPlaylistStatus {
  loading: boolean;
  error: string | null;
  count: number;
  fetchedAt: string | null;
  updatedAt: string | null;
}

/** Signed-in account (runtime; session lives in an httpOnly cookie) */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type SyncStatus = "idle" | "syncing" | "saved" | "error";

const STATUS_MAX_AGE_MS = 6 * 60 * 60 * 1000; // drop cached statuses older than 6h

interface IPTVState {
  // ---- playlist data (not persisted; fetched at runtime) ----
  channels: Channel[];
  groups: GroupInfo[];
  playlistUpdatedAt: string | null;
  playlistFetchedAt: string | null;
  /** channels of the built-in playlist only */
  defaultChannels: Channel[];

  // ---- user-added playlists ----
  customPlaylists: CustomPlaylist[]; // persisted metadata
  customChannels: Record<string, Channel[]>; // runtime, keyed by playlist id
  customStatus: Record<string, CustomPlaylistStatus>; // runtime sync status

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

  // ---- ui ----
  settingsOpen: boolean;

  // ---- account & cloud sync (runtime, not persisted) ----
  authUser: AuthUser | null;
  syncStatus: SyncStatus;
  lastSyncedAt: number | null;

  // ---- actions ----
  setDefaultPlaylist: (channels: Channel[], updatedAt: string | null, fetchedAt: string | null) => void;
  setCustomChannels: (playlistId: string, channels: Channel[]) => void;
  setCustomStatus: (playlistId: string, status: Partial<CustomPlaylistStatus> & { count?: number }) => void;
  addCustomPlaylist: (url: string, name?: string) => { ok: boolean; id?: string; error?: string; duplicate?: boolean };
  removeCustomPlaylist: (id: string) => void;
  renameCustomPlaylist: (id: string, name: string) => void;
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
  setSettingsOpen: (v: boolean) => void;
  setAuthUser: (u: AuthUser | null) => void;
  setSyncStatus: (s: SyncStatus, at?: number) => void;
  mergeServerData: (data: {
    favorites: string[];
    recents: string[];
    playlists: CustomPlaylist[];
    prefs?: { playMode?: PlayMode; autoSkip?: boolean; volume?: number; muted?: boolean };
  }) => void;
}

/** Derive a friendly default name from a playlist URL (e.g. "iptv.example.com") */
function nameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "My playlist";
  }
}

export const useIPTV = create<IPTVState>()(
  persist(
    (set, get) => {
      /** Rebuild the merged channel list + groups; prune stale statuses */
      const remerge = () => {
        const st = get();
        const seen = new Set<string>();
        const merged: Channel[] = [];
        for (const c of st.defaultChannels) {
          if (seen.has(c.url)) continue;
          seen.add(c.url);
          merged.push(c);
        }
        for (const p of st.customPlaylists) {
          for (const c of st.customChannels[p.id] ?? []) {
            if (seen.has(c.url)) continue; // default playlist wins on duplicates
            seen.add(c.url);
            merged.push(c);
          }
        }
        const valid = new Set(merged.map((c) => c.url));
        const now = Date.now();
        const statuses: Record<string, StatusInfo> = {};
        for (const [url, info] of Object.entries(st.statuses)) {
          if (valid.has(url) && now - info.checkedAt < STATUS_MAX_AGE_MS) statuses[url] = info;
        }
        set({ channels: merged, groups: buildGroups(merged), statuses });
      };

      return {
        channels: [],
        groups: [],
        playlistUpdatedAt: null,
        playlistFetchedAt: null,
        defaultChannels: [],

        customPlaylists: [],
        customChannels: {},
        customStatus: {},

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

        settingsOpen: false,

        authUser: null,
        syncStatus: "idle",
        lastSyncedAt: null,

        setDefaultPlaylist: (channels, updatedAt, fetchedAt) => {
          set({
            defaultChannels: channels,
            playlistUpdatedAt: updatedAt,
            playlistFetchedAt: fetchedAt,
          });
          remerge();
        },

        setCustomChannels: (playlistId, channels) => {
          set((st) => ({ customChannels: { ...st.customChannels, [playlistId]: channels } }));
          remerge();
        },

        setCustomStatus: (playlistId, status) => {
          set((st) => {
            const prev: CustomPlaylistStatus =
              st.customStatus[playlistId] ?? { loading: false, error: null, count: 0, fetchedAt: null, updatedAt: null };
            return { customStatus: { ...st.customStatus, [playlistId]: { ...prev, ...status } } };
          });
        },

        addCustomPlaylist: (url, name) => {
          const trimmed = url.trim();
          let parsed: URL;
          try {
            parsed = new URL(trimmed);
          } catch {
            return { ok: false, error: "That doesn't look like a valid link" };
          }
          if (!/^https?:$/.test(parsed.protocol)) {
            return { ok: false, error: "Only http(s) links are supported" };
          }
          const id = hashId(trimmed);
          const st = get();
          if (st.customPlaylists.some((p) => p.id === id)) {
            return { ok: false, duplicate: true, id, error: "This playlist is already added" };
          }
          const finalName = (name || "").trim().slice(0, 60) || nameFromUrl(trimmed);
          set({ customPlaylists: [...st.customPlaylists, { id, name: finalName, url: trimmed, addedAt: Date.now() }] });
          set((s) => ({
            customStatus: {
              ...s.customStatus,
              [id]: { loading: true, error: null, count: 0, fetchedAt: null, updatedAt: null },
            },
          }));
          return { ok: true, id };
        },

        removeCustomPlaylist: (id) => {
          set((st) => {
            const { [id]: _removed, ...restChannels } = st.customChannels;
            const { [id]: _removedStatus, ...restStatus } = st.customStatus;
            return {
              customPlaylists: st.customPlaylists.filter((p) => p.id !== id),
              customChannels: restChannels,
              customStatus: restStatus,
            };
          });
          remerge();
        },

        renameCustomPlaylist: (id, name) => {
          const clean = name.trim().slice(0, 60);
          if (!clean) return;
          set((st) => ({
            customPlaylists: st.customPlaylists.map((p) => (p.id === id ? { ...p, name: clean } : p)),
          }));
          // re-tag channels with the new name
          const st = get();
          const chans = st.customChannels[id];
          if (chans) {
            set((s) => ({
              customChannels: { ...s.customChannels, [id]: chans.map((c) => ({ ...c, sourceName: clean })) },
            }));
          }
          remerge();
        },

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

        setSettingsOpen: (v) => set({ settingsOpen: v }),

        setAuthUser: (u) => set({ authUser: u, syncStatus: "idle" }),

        setSyncStatus: (s, at) => set({ syncStatus: s, ...(at !== undefined ? { lastSyncedAt: at } : {}) }),

        /**
         * Merge account data (pulled from the server) into local state.
         * Union semantics — nothing the user had locally is lost:
         *  - playlists: server first, then local-only (deduped by id)
         *  - favorites: server order first, then local-only
         *  - recents: same, capped at 30
         *  - prefs stay local (device-specific: volume, mode, auto-skip)
         */
        mergeServerData: (data) => {
          const st = get();
          const plIds = new Set(data.playlists.map((p) => p.id));
          const playlists = [...data.playlists, ...st.customPlaylists.filter((p) => !plIds.has(p.id))];
          const favSet = new Set(data.favorites);
          const favorites = [...data.favorites, ...st.favorites.filter((f) => !favSet.has(f))].slice(0, 200);
          const recSet = new Set(data.recents);
          const recents = [...data.recents, ...st.recents.filter((r) => !recSet.has(r))].slice(0, 30);
          set({ customPlaylists: playlists, favorites, recents });
          remerge();
        },
      };
    },
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
        customPlaylists: st.customPlaylists,
      }),
    }
  )
);
