"use client";

/**
 * Player panel: sticky video player + info bar + horizontal quick-switch strip
 * of channels from the same group.
 */
import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Heart, X, Copy, ExternalLink, Radio } from "lucide-react";
import type { Channel } from "@/lib/m3u";
import { useIPTV } from "@/store/iptv-store";
import { VideoPlayer } from "./video-player";
import { ChannelLogo, StatusBadge } from "./channel-bits";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PlayerPanelProps {
  channel: Channel;
  visibleChannels: Channel[];
  onPrev: () => void;
  onNext: () => void;
}

export function PlayerPanel({ channel, visibleChannels, onPrev, onNext }: PlayerPanelProps) {
  const stop = useIPTV((s) => s.stop);
  const toggleFavorite = useIPTV((s) => s.toggleFavorite);
  const isFavorite = useIPTV((s) => s.favorites.includes(channel.id));
  const play = useIPTV((s) => s.play);
  const status = useIPTV((s) => s.statuses[channel.url]);

  const related = useMemo(() => {
    const sameGroup = visibleChannels.filter((c) => c.id !== channel.id && c.group === channel.group);
    const rest = visibleChannels.filter((c) => c.id !== channel.id && c.group !== channel.group);
    return [...sameGroup, ...rest].slice(0, 24);
  }, [visibleChannels, channel]);

  const position = visibleChannels.findIndex((c) => c.id === channel.id) + 1;
  const isRadio = /radio/i.test(channel.group);

  return (
    <section className="sticky top-14 sm:top-16 z-30 -mx-2 sm:mx-0 px-2 sm:px-0" aria-label="Now playing">
      <div className="rounded-none sm:rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/80 dark:supports-[backdrop-filter]:bg-zinc-950/80">
        <VideoPlayer channel={channel} onPrev={onPrev} onNext={onNext} onClose={stop} />

        {/* Info bar */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden shrink-0">
            <button
              onClick={onPrev}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Previous channel"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="w-px bg-zinc-200 dark:bg-zinc-800" />
            <button
              onClick={onNext}
              className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Next channel"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {channel.name}
              </h2>
              <StatusBadge status={status} />
              {isRadio && (
                <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  <Radio className="w-3 h-3" /> Radio
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              {channel.group}
              {position > 0 && <span> · channel {position} of {visibleChannels.length}</span>}
              <span className="hidden sm:inline"> · ←/→ to zap, Space pause, F fullscreen</span>
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="icon"
              variant="ghost"
              className={cn("h-9 w-9", isFavorite && "text-rose-500")}
              onClick={() => toggleFavorite(channel.id)}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() =>
                navigator.clipboard?.writeText(channel.url).then(
                  () => toast({ title: "Stream link copied", description: "Works in VLC, TiviMate and other players" }),
                  () => {}
                )
              }
              aria-label="Copy stream link"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <a
              href={channel.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500"
              aria-label="Open raw stream in a new tab"
              title="Open raw stream"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <Button
              size="icon"
              variant="ghost"
              className="h-9 w-9 max-sm:hidden"
              onClick={stop}
              aria-label="Close player"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Quick-switch strip */}
        {related.length > 0 && (
          <div className="border-t border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Quick switch
              </p>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:block">
                Tip: press ← / → on your keyboard
              </p>
            </div>
            <div className="flex gap-2 overflow-x-auto px-3 pb-3 no-scrollbar">
              {related.map((c) => (
                <QuickSwitchChip key={c.id} channel={c} onClick={() => play(c.id)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function QuickSwitchChip({ channel, onClick }: { channel: Channel; onClick: () => void }) {
  const status = useIPTV((s) => s.statuses[channel.url]);
  const isCurrent = useIPTV((s) => s.currentId === channel.id);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2 py-1.5 shrink-0 max-w-52 transition-colors",
        isCurrent
          ? "border-emerald-500/60 bg-emerald-500/10"
          : "border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/40 hover:bg-emerald-500/[0.06]"
      )}
      title={`Switch to ${channel.name}`}
    >
      <ChannelLogo channel={channel} className="w-8 h-8" />
      <span className="min-w-0 flex flex-col items-start">
        <span className="max-w-36 truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
          {channel.name}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium",
            !status
              ? "text-zinc-400"
              : status.status === "online"
                ? "text-emerald-500"
                : "text-rose-400"
          )}
        >
          {!status ? "checking…" : status.status === "online" ? "working" : "down"}
        </span>
      </span>
    </button>
  );
}
