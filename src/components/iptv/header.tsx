"use client";

/**
 * App header: brand, global search, sync status, refresh, theme toggle,
 * account (sign in / user menu).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, Search, Sun, Moon, Tv, X, Settings, UserRound, LogOut, CloudUpload, Check, Loader2, TriangleAlert } from "lucide-react";
import { useTheme } from "next-themes";
import { useIPTV } from "@/store/iptv-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsDialog } from "./settings-dialog";
import { pushUserData, signOutEverywhere } from "./auth-sync";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

        {/* Account */}
        <AccountMenu />

        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 shrink-0"
          onClick={() => useIPTV.getState().setSettingsOpen(true)}
          aria-label="Settings — manage playlists"
          title="Settings — add your own playlists"
        >
          <Settings className="w-4 h-4" />
        </Button>

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

      <SettingsDialog />
    </header>
  );
}

/* ---------------- Account ---------------- */

function initialsOf(name: string, email: string): string {
  const src = name.trim() || email;
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  const ini = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");
  return ini || "?";
}

function AccountMenu() {
  const user = useIPTV((s) => s.authUser);
  const syncStatus = useIPTV((s) => s.syncStatus);
  const lastSyncedAt = useIPTV((s) => s.lastSyncedAt);

  if (!user) {
    return (
      <Button asChild variant="outline" size="sm" className="h-9 shrink-0 rounded-full border-emerald-600/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/10 hover:border-emerald-600 font-medium">
        <Link href="/login" aria-label="Sign in or create an account">
          <UserRound className="w-4 h-4 sm:mr-1.5" />
          <span className="hidden sm:inline">Sign in</span>
        </Link>
      </Button>
    );
  }

  const backup = async () => {
    const ok = await pushUserData();
    toast({
      title: ok ? "Backed up" : "Backup failed",
      description: ok ? "Your favorites & playlists are saved to your account" : "Check your connection and try again",
      variant: ok ? "default" : "destructive",
    });
  };

  const signOut = async () => {
    await signOutEverywhere();
    toast({ title: "Signed out", description: "Your saved data stays safe in your account" });
  };

  const rel = lastSyncedAt
    ? Date.now() - lastSyncedAt < 60_000
      ? "just now"
      : `${Math.round((Date.now() - lastSyncedAt) / 60000)} min ago`
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold shadow-sm hover:brightness-110 transition shrink-0"
          aria-label={`Account — ${user.name || user.email}`}
        >
          {initialsOf(user.name, user.email)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold truncate">{user.name || "Viewer"}</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {syncStatus === "syncing" ? (
            <><Loader2 className="w-3 h-3 animate-spin text-emerald-500" /> backing up…</>
          ) : syncStatus === "error" ? (
            <><TriangleAlert className="w-3 h-3 text-amber-500" /> backup failed — will retry on change</>
          ) : syncStatus === "saved" ? (
            <><Check className="w-3 h-3 text-emerald-500" /> saved to account{rel ? ` · ${rel}` : ""}</>
          ) : (
            <><CloudUpload className="w-3 h-3" /> auto-backup on</>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={backup} className="cursor-pointer">
          <CloudUpload className="w-4 h-4" /> Back up now
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => useIPTV.getState().setSettingsOpen(true)} className="cursor-pointer">
          <Settings className="w-4 h-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut} className="cursor-pointer text-rose-500 focus:text-rose-500">
          <LogOut className="w-4 h-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function showToast(title: string) {
  toast({ title });
}
