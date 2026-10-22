"use client";

/**
 * Category sidebar (desktop) + horizontal chips (mobile).
 */
import { LayoutGrid, Heart, History, Link2, Plus } from "lucide-react";
import { useIPTV } from "@/store/iptv-store";
import { cn } from "@/lib/utils";
import type { Channel } from "@/lib/m3u";

interface SidebarProps {
  channelsById: Map<string, Channel>;
}

export function Sidebar({ channelsById }: SidebarProps) {
  const groups = useIPTV((s) => s.groups);
  const total = useIPTV((s) => s.channels.length);
  const group = useIPTV((s) => s.group);
  const specialView = useIPTV((s) => s.specialView);
  const setGroup = useIPTV((s) => s.setGroup);
  const setSpecialView = useIPTV((s) => s.setSpecialView);
  const favorites = useIPTV((s) => s.favorites);
  const recents = useIPTV((s) => s.recents);
  const customCount = useIPTV((s) => s.channels.reduce((n, c) => (c.sourceId ? n + 1 : n), 0));
  const setSettingsOpen = useIPTV((s) => s.setSettingsOpen);

  const favCount = favorites.filter((id) => channelsById.has(id)).length;
  const recentCount = recents.filter((id) => channelsById.has(id)).length;

  const itemClass = (active: boolean) =>
    cn(
      "w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
      active
        ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/30"
        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-transparent"
    );

  return (
    <nav className="hidden lg:flex flex-col w-60 xl:w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 pr-3 py-4 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto thin-scrollbar" aria-label="Categories">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Library
      </p>
      <div className="flex flex-col gap-0.5">
        <button
          className={itemClass(specialView === "all" && !group)}
          onClick={() => setSpecialView("all")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <LayoutGrid className="w-4 h-4 shrink-0" /> All channels
          </span>
          <Count>{total}</Count>
        </button>
        <button
          className={itemClass(specialView === "favorites")}
          onClick={() => setSpecialView("favorites")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Heart className="w-4 h-4 shrink-0" /> Favorites
          </span>
          <Count>{favCount}</Count>
        </button>
        <button
          className={itemClass(specialView === "recents")}
          onClick={() => setSpecialView("recents")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <History className="w-4 h-4 shrink-0" /> Recently watched
          </span>
          <Count>{recentCount}</Count>
        </button>
        <button
          className={itemClass(specialView === "custom")}
          onClick={() => setSpecialView("custom")}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Link2 className="w-4 h-4 shrink-0" /> My playlists
          </span>
          <Count>{customCount}</Count>
        </button>
        <button
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 border border-dashed border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/40 transition-colors"
          onClick={() => setSettingsOpen(true)}
        >
          <Plus className="w-4 h-4 shrink-0" /> Add playlist
        </button>
      </div>

      <p className="px-3 pt-5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        Categories
      </p>
      <div className="flex flex-col gap-0.5">
        {groups.map((g) => (
          <button
            key={g.name}
            className={itemClass(group === g.name && specialView === "all")}
            onClick={() => setGroup(group === g.name ? null : g.name)}
          >
            <span className="truncate text-left" title={g.name}>
              {g.name}
            </span>
            <Count>{g.count}</Count>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-zinc-200/70 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 tabular-nums">
      {children}
    </span>
  );
}

/** Horizontal category chips (mobile / tablet) */
export function GroupChips() {
  const groups = useIPTV((s) => s.groups);
  const total = useIPTV((s) => s.channels.length);
  const group = useIPTV((s) => s.group);
  const specialView = useIPTV((s) => s.specialView);
  const setGroup = useIPTV((s) => s.setGroup);
  const setSpecialView = useIPTV((s) => s.setSpecialView);
  const favorites = useIPTV((s) => s.favorites);
  const recents = useIPTV((s) => s.recents);
  const customCount = useIPTV((s) => s.channels.reduce((n, c) => (c.sourceId ? n + 1 : n), 0));
  const setSettingsOpen = useIPTV((s) => s.setSettingsOpen);

  const chip = (active: boolean) =>
    cn(
      "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active
        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-600/30"
        : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-emerald-500/40"
    );

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3 lg:hidden" role="tablist" aria-label="Categories">
      <button className={chip(specialView === "all" && !group)} onClick={() => setSpecialView("all")}>
        All ({total})
      </button>
      <button className={chip(specialView === "favorites")} onClick={() => setSpecialView("favorites")}>
        ★ Favorites ({favorites.length})
      </button>
      {specialView === "recents" ? null : null}
      <button className={chip(specialView === "recents")} onClick={() => setSpecialView("recents")}>
        ⏱ Recent ({recents.length})
      </button>
      <button className={chip(specialView === "custom")} onClick={() => setSpecialView("custom")}>
        <span className="inline-flex items-center gap-1">⊕ My lists ({customCount})</span>
      </button>
      <button
        className="shrink-0 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        onClick={() => setSettingsOpen(true)}
      >
        + Add playlist
      </button>
      <span className="w-px bg-zinc-200 dark:bg-zinc-800 shrink-0 my-1" />
      {groups.map((g) => (
        <button
          key={g.name}
          className={chip(group === g.name && specialView === "all")}
          onClick={() => setGroup(group === g.name ? null : g.name)}
        >
          {g.name} ({g.count})
        </button>
      ))}
    </div>
  );
}
