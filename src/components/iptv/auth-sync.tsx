"use client";

/**
 * Account sync engine (invisible component — mount once in the page).
 *
 *  - Hydrates the session from /api/auth/me (TanStack Query, refetch on focus)
 *  - PULL: when a signed-in user appears, fetch their backed-up data and
 *    union-merge it into local state (see store.mergeServerData)
 *  - PUSH: debounce-watches favorites / recents / playlists and uploads the
 *    snapshot to the account. Pushes are skipped while a pull is running so
 *    the merge itself doesn't trigger a redundant write.
 *
 * Everything also works signed-out (guest) — sync simply stays idle.
 */
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useIPTV, type AuthUser } from "@/store/iptv-store";

/** module-level so the header/settings can trigger a manual backup */
let pullInFlight = false;

/** Push the current store snapshot to the signed-in user's account. */
export async function pushUserData(): Promise<boolean> {
  const st = useIPTV.getState();
  if (!st.authUser || pullInFlight) return false;
  st.setSyncStatus("syncing");
  try {
    const res = await fetch("/api/user/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        favorites: st.favorites,
        recents: st.recents,
        playlists: st.customPlaylists,
        prefs: {
          playMode: st.playMode,
          autoSkip: st.autoSkip,
          volume: st.volume,
          muted: st.muted,
        },
      }),
    });
    if (!res.ok) throw new Error(`push failed (${res.status})`);
    useIPTV.getState().setSyncStatus("saved", Date.now());
    return true;
  } catch {
    useIPTV.getState().setSyncStatus("error");
    return false;
  }
}

export async function signOutEverywhere(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  useIPTV.getState().setAuthUser(null);
}

export function AuthSync() {
  const queryClient = useQueryClient();

  // ---- session hydration ----
  const meQuery = useQuery<{ user: AuthUser | null }>({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return { user: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const userId = meQuery.data?.user?.id ?? null;

  useEffect(() => {
    useIPTV.getState().setAuthUser(meQuery.data?.user ?? null);
  }, [meQuery.data]);

  // ---- PULL on login ----
  const pulledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!userId) {
      pulledFor.current = null;
      return;
    }
    if (pulledFor.current === userId) return;
    pulledFor.current = userId;

    (async () => {
      pullInFlight = true;
      try {
        const res = await fetch("/api/user/data");
        if (res.ok) {
          const { data } = await res.json();
          if (data) useIPTV.getState().mergeServerData(data);
          // push the union back so a fresh account row reflects the merged state
          pullInFlight = false;
          await pushUserData();
          useIPTV.getState().setSyncStatus("saved", Date.now());
        }
      } catch {
        useIPTV.getState().setSyncStatus("error");
      } finally {
        pullInFlight = false;
      }
    })();
  }, [userId]);

  // ---- PUSH watcher (debounced) ----
  const signedIn = Boolean(userId);
  const meResolved = meQuery.isSuccess;
  useEffect(() => {
    if (!signedIn || !meResolved) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = useIPTV.subscribe((next, prev) => {
      const changed =
        prev.favorites !== next.favorites ||
        prev.recents !== next.recents ||
        prev.customPlaylists !== next.customPlaylists;
      if (!changed || pullInFlight) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        pushUserData();
      }, 2500);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, [signedIn, meResolved]);

  // ---- cross-device: pull again when the tab regains focus (max every 10 min) ----
  const lastFocusPull = useRef(0);
  useEffect(() => {
    if (!signedIn) return;
    const onFocus = () => {
      if (Date.now() - lastFocusPull.current < 10 * 60 * 1000) return;
      lastFocusPull.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] }).then(() => {
        if (pulledFor.current) pulledFor.current = null; // allow re-pull
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [signedIn, queryClient]);

  return null;
}
