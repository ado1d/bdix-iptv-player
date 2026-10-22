"use client";

/**
 * App header: brand, global search, sync status, refresh, theme toggle.
 */
import { useEffect, useState } from "react";
import { RefreshCw, Search, Sun, Moon, Tv, X } from "lucide-react";
import { useTheme } from "next-themes";
import { useIPTV } from "@/store/iptv-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface HeaderProps {
  refreshing: boolean;
  onRefresh: () => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}

export function Header({ refreshing, onRefresh, searchRef }: HeaderProps) {
  const search = useIPTV((s) => s.search);
  const setSearch = useIPTV((s) => s.setSearch);
  const total = useIPTV((s) => s.channels.length);
  const updatedAt = useIPTV((s) => s.playlistUpdatedAt);
  const [now, setNow] = useState(() => Date.now());

  const { setTheme } = useTheme();

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const syncedAgo = useIPTV((s) => s.playlistFetchedAt);

  const syncLabel = (() => {
    if (!syncedAgo) return null;
    const mins = Math.max(0, Math.round((now - new Date(syncedAgo).getTime()) / 60000));
    if (mins < 1) return "synced just now";
    if (mins < 60) return `synced ${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return `synced ${hrs}h ago`;
  })();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-200 dark:border-zinc-800 bg-white/85 dark:bg-zinc-950/85 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:supports-[backdrop-filter]:bg-zinc-950/70">
      <div className="mx-auto flex h-14 sm:h-16 max-w-[1700px] items-center gap-2 sm:gap-4 px-3 sm:px-5">
        {/* Brand */}
        <button
          onClick={() => {
            useIPTV.getState().setSpecialView("all");
            useIPTV.getState().setGroup(null);
            useIPTV.getState().setSearch("");
          }}
          className="flex items-center gap-2.5 shrink-0 group"
          aria-label="BDIX TV home"
        >
          <span className="grid place-items-center w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25 group-hover:bg-emerald-500 transition-colors">
            <Tv className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
          </span>
          <span className="hidden sm:flex flex-col leading-none text-left">
            <span className="font-bold tracking-tight text-zinc-900 dark:text-white text-[15px]">
              BDIX TV
            </span>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              live channels, always fresh
            </span>
          </span>
        </button>

        {/* Search */}
        <div className="relative flex-1 max-w-xl min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearch("");
                e.currentTarget.blur();
              }
            }}
            placeholder="Search channels… (press /)"
            className="pl-9 pr-8 h-10 rounded-full bg-zinc-100 dark:bg-zinc-900 border-transparent focus-visible:ring-emerald-500/40 text-sm"
            aria-label="Search channels"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sync status (desktop) */}
        <div className="hidden lg:flex flex-col items-end leading-tight text-[11px] text-zinc-500 dark:text-zinc-400 min-w-0">
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            {total > 0 ? `${total} channels` : "…"}
            {updatedAt && <span className="font-normal text-zinc-400 dark:text-zinc-500"> · src updated {updatedAt}</span>}
          </span>
          <span className="truncate max-w-64">{total > 0 ? syncLabel : "loading playlist…"}</span>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh playlist"
          title="Refresh playlist from source"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            const isDark = document.documentElement.classList.contains("dark");
            setTheme(isDark ? "light" : "dark");
          }}
          aria-label="Toggle theme"
        >
          <Sun className="w-4 h-4 hidden dark:block" />
          <Moon className="w-4 h-4 dark:hidden" />
        </Button>
      </div>
    </header>
  );
}

export function showToast(title: string) {
  toast({ title });
}
