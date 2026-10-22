"use client";

/**
 * Small shared pieces: channel logo (with initials fallback),
 * status badge (checking / online / offline), playing indicator.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { Channel } from "@/lib/m3u";
import type { StatusInfo } from "@/store/iptv-store";
import { cn } from "@/lib/utils";

const PALETTE = [
  "from-emerald-500/80 to-teal-700/80",
  "from-rose-500/80 to-red-700/80",
  "from-amber-500/80 to-orange-700/80",
  "from-violet-500/80 to-purple-700/80",
  "from-cyan-500/80 to-sky-700/80",
  "from-lime-500/80 to-green-700/80",
];

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/);
  if (!words[0]) return "TV";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function ChannelLogo({ channel, className }: { channel: Channel; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = channel.logo ? channel.logo.replace(/^http:\/\//i, "https://") : "";
  const idx = channel.name.length % PALETTE.length;

  if (!src || failed) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-md bg-gradient-to-br font-semibold text-white/90 shrink-0",
          PALETTE[idx],
          className
        )}
        aria-hidden
      >
        <span className="text-[11px] tracking-wide">{initials(channel.name)}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn(
        "rounded-md object-contain bg-zinc-100 dark:bg-zinc-800/80 shrink-0",
        className
      )}
    />
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: StatusInfo | undefined;
  className?: string;
}) {
  if (!status) {
    return <span className={cn("inline-block w-2 h-2 rounded-full bg-zinc-400/50 dark:bg-zinc-600", className)} title="Not checked yet" />;
  }
  if (status.status === "online") {
    return (
      <span
        className={cn("inline-block w-2 h-2 rounded-full bg-emerald-500", className)}
        title={`Online${status.latencyMs ? ` · ${status.latencyMs}ms` : ""}`}
      />
    );
  }
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full bg-rose-500", className)}
      title={`Offline · ${status.reason || "unreachable"}`}
    />
  );
}

export function StatusBadge({ status }: { status: StatusInfo | undefined }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 dark:border-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400/60" /> Unknown
      </span>
    );
  }
  if (status.status === "online") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Working
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
      <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
      Down
    </span>
  );
}

export function CheckingSpinner({ className }: { className?: string }) {
  return <Loader2 className={cn("w-3 h-3 animate-spin text-zinc-400", className)} />;
}

export function PlayingBars({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-end gap-[2px] h-3.5", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-sm bg-emerald-500 animate-eq"
          style={{ animationDelay: `${i * 0.15}s`, height: "60%" }}
        />
      ))}
    </span>
  );
}
