"use client";

/**
 * Channel card. Registers itself with the IntersectionObserver-driven
 * status checker so visible channels get their status first.
 */
import { useEffect, useRef } from "react";
import { Heart, Link2 } from "lucide-react";
import type { Channel } from "@/lib/m3u";
import { useIPTV } from "@/store/iptv-store";
import { statusChecker } from "@/lib/checker";
import { ChannelLogo, PlayingBars, StatusDot } from "./channel-bits";
import { cn } from "@/lib/utils";

interface ChannelCardProps {
  channel: Channel;
  index: number;
}

export function ChannelCard({ channel, index }: ChannelCardProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const status = useIPTV((s) => s.statuses[channel.url]);
  const isFavorite = useIPTV((s) => s.favorites.includes(channel.id));
  const toggleFavorite = useIPTV((s) => s.toggleFavorite);
  const play = useIPTV((s) => s.play);
  const isCurrent = useIPTV((s) => s.currentId === channel.id);

  // When this card becomes visible, prioritize its status check
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let scheduled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && !scheduled) {
            scheduled = true;
            statusChecker.checkVisible(channel.url);
          }
        }
      },
      { rootMargin: "300px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [channel.url]);

  return (
    <button
      ref={ref}
      onClick={() => play(channel.id)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all",
        "hover:border-emerald-500/40 hover:bg-emerald-500/[0.06] hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60",
        isCurrent
          ? "border-emerald-500/60 bg-emerald-500/10 ring-1 ring-emerald-500/40"
          : "border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60"
      )}
      aria-label={`Play ${channel.name}`}
      aria-pressed={isCurrent}
    >
      <div className="relative shrink-0">
        <ChannelLogo channel={channel} className="w-11 h-11" />
        {isCurrent ? (
          <span className="absolute -top-1.5 -right-1.5 rounded-full bg-emerald-600 px-1 py-px shadow">
            <PlayingBars className="h-3 scale-90" />
          </span>
        ) : null}
      </div>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <StatusDot status={status} className="shrink-0" />
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {channel.name}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="truncate">{channel.group}</span>
          <span className="text-zinc-300 dark:text-zinc-700">·</span>
          <span className="shrink-0">#{index + 1}</span>
          {channel.sourceId && (
            <span
              className="shrink-0 inline-flex items-center gap-0.5 text-violet-500 dark:text-violet-400"
              title={`From your playlist: ${channel.sourceName ?? "custom"}`}
            >
              <Link2 className="w-3 h-3" />
            </span>
          )}
        </span>
      </span>

      <span
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(channel.id);
        }}
        className={cn(
          "shrink-0 rounded-full p-1.5 transition-colors",
          isFavorite
            ? "text-rose-500 hover:bg-rose-500/10"
            : "text-zinc-400 hover:text-rose-400 opacity-0 sm:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
        )}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
      </span>
    </button>
  );
}

export function ChannelCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-2.5">
      <div className="w-11 h-11 rounded-md bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
        <div className="h-2.5 w-1/2 rounded bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
      </div>
    </div>
  );
}
