"use client";

/**
 * HLS video player built on hls.js with:
 *  - Direct → proxy auto-fallback (CORS / mixed-content rescue)
 *  - Per-host memory of which mode worked
 *  - Custom controls: play/pause, volume, quality, PiP, fullscreen
 *  - Audio-only mode for radio channels
 *  - Error overlay with retry / next / copy-link and optional auto-skip
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/m3u";
import { useIPTV } from "@/store/iptv-store";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  PictureInPicture2,
  Loader2,
  ChevronRight,
  Copy,
  RefreshCw,
  Signal,
  Settings2,
  Check,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Phase = "loading" | "playing" | "error";

interface PlayerProps {
  channel: Channel;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function VideoPlayer({ channel, onPrev, onNext, onClose }: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<{ destroy: () => void; currentLevel: number; levels: unknown[]; on: (...a: unknown[]) => void; off: (...a: unknown[]) => void } | null>(null);

  const playMode = useIPTV((s) => s.playMode);
  const hostModes = useIPTV((s) => s.hostModes);
  const rememberHostMode = useIPTV((s) => s.rememberHostMode);
  const volume = useIPTV((s) => s.volume);
  const muted = useIPTV((s) => s.muted);
  const setVolume = useIPTV((s) => s.setVolume);
  const setMuted = useIPTV((s) => s.setMuted);
  const autoSkip = useIPTV((s) => s.autoSkip);
  const setAutoSkip = useIPTV((s) => s.setAutoSkip);

  const [modeOverride, setModeOverride] = useState<"direct" | "proxy" | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorCode, setErrorCode] = useState<string>("");
  const [buffering, setBuffering] = useState(true);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [audioOnly, setAudioOnly] = useState(false);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [currentLevel, setCurrentLevel] = useState(-1);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const host = (() => {
    try {
      return new URL(channel.url).host;
    } catch {
      return "";
    }
  })();

  // Resolve effective playback mode
  const isHttpPage = typeof window !== "undefined" && window.location.protocol === "https:";
  const mixedContent = isHttpPage && channel.url.startsWith("http://");
  let effectiveMode: "direct" | "proxy";
  if (playMode === "direct") effectiveMode = "direct";
  else if (playMode === "proxy") effectiveMode = "proxy";
  else effectiveMode = modeOverride ?? (mixedContent ? "proxy" : hostModes[host] ?? "direct");

  const src =
    effectiveMode === "proxy"
      ? `/api/proxy?url=${encodeURIComponent(channel.url)}`
      : channel.url;

  const clearHideTimer = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  };

  const scheduleHideControls = useCallback(() => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setShowControls(false), 2600);
  }, []);

  // ---------- hls.js lifecycle ----------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let hlsInstance: {
      destroy: () => void;
      currentLevel: number;
      levels: { height?: number; bitrate?: number }[];
      on: (ev: string, fn: (...a: unknown[]) => void) => void;
      off: (ev: string, fn: (...a: unknown[]) => void) => void;
    } | null = null;

    setPhase("loading");
    setBuffering(true);
    setErrorCode("");
    setAudioOnly(false);
    setPaused(false);
    setLevels([]);
    setCurrentLevel(-1);
    setShowControls(true);

    const onPlaying = () => {
      setPhase("playing");
      setBuffering(false);
      setPaused(false);
      if (video.videoWidth === 0) setAudioOnly(true);
      // remember what worked
      if (effectiveMode === "direct") rememberHostMode(host, "direct");
    };
    const onWaiting = () => setBuffering(true);
    const onPause = () => setPaused(true);
    const onPlay = () => setPaused(false);

    video.addEventListener("playing", onPlaying);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    (async () => {
      let HlsCtor: typeof import("hls.js").default | null = null;
      try {
        const mod = await import("hls.js");
        HlsCtor = mod.default;
      } catch {
        if (!cancelled) {
          setPhase("error");
          setErrorCode("Player failed to load");
        }
        return;
      }
      if (cancelled) return;

      const nativeHls = video.canPlayType("application/vnd.apple.mpegurl");

      if (HlsCtor && HlsCtor.isSupported()) {
        const hls = new HlsCtor({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 30,
          maxBufferLength: 24,
          maxMaxBufferLength: 60,
          liveSyncDurationCount: 3,
          manifestLoadingTimeOut: 12000,
          manifestLoadingMaxRetry: 1,
          manifestLoadingRetryDelay: 500,
          levelLoadingTimeOut: 12000,
          levelLoadingMaxRetry: 2,
          fragLoadingTimeOut: 25000,
          fragLoadingMaxRetry: 4,
        });
        hlsInstance = hls;
        hlsRef.current = hls as unknown as typeof hlsRef.current;

        hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          setLevels(
            hls.levels.map((l, i) => ({
              index: i,
              label: l.height ? `${l.height}p` : `${Math.round((l.bitrate ?? 0) / 1000)}k`,
            }))
          );
          video.muted = true;
          video.play().then(() => {
            if (muted === false && volume > 0) {
              video.muted = false;
              video.volume = volume;
              video.play().catch(() => {
                // Autoplay policy blocked unmuted playback — resume muted + prompt
                video.muted = true;
                setNeedsUnmute(true);
                video.play().catch(() => setPaused(true));
              });
            } else {
              setNeedsUnmute(true);
            }
          }).catch(() => {
            // Autoplay blocked — wait for user gesture
            setNeedsUnmute(true);
            setPaused(true);
          });
        });

        hls.on(HlsCtor.Events.LEVEL_SWITCHED, (_e, data) => {
          setCurrentLevel(data.level);
        });

        hls.on(HlsCtor.Events.ERROR, (_e, data) => {
          if (cancelled || !data.fatal) return;
          if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
            if (effectiveMode === "direct") {
              // CORS / mixed-content rescue → retry through the proxy
              rememberHostMode(host, "proxy");
              setModeOverride("proxy");
            } else {
              setPhase("error");
              setErrorCode(
                data.details === "manifestLoadError"
                  ? "Stream unreachable through the proxy"
                  : `Network error (${data.details})`
              );
            }
          } else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
            try {
              hls.recoverMediaError();
            } catch {
              setPhase("error");
              setErrorCode("Media error");
            }
          } else {
            setPhase("error");
            setErrorCode("Fatal player error");
          }
        });

        hls.loadSource(src);
        hls.attachMedia(video);
      } else if (nativeHls) {
        // Safari / iOS native HLS
        video.src = src;
        video.muted = true;
        video.play().then(() => {
          if (muted === false && volume > 0) {
            video.muted = false;
            video.volume = volume;
            video.play().catch(() => {
              video.muted = true;
              setNeedsUnmute(true);
              video.play().catch(() => setPaused(true));
            });
          } else {
            setNeedsUnmute(true);
          }
        }).catch(() => {
          setNeedsUnmute(true);
          setPaused(true);
        });
      } else {
        setPhase("error");
        setErrorCode("HLS is not supported in this browser");
      }
    })();

    return () => {
      cancelled = true;
      clearHideTimer();
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      try {
        hlsInstance?.destroy();
      } catch {
        /* noop */
      }
      hlsRef.current = null;
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        /* noop */
      }
    };
  }, [src, effectiveMode, channel.id, retryNonce]);

  // Apply volume changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted || volume === 0;
  }, [volume, muted]);

  // Auto-skip broken channels
  useEffect(() => {
    if (phase !== "error" || !autoSkip) return;
    setCountdown(3);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c === null) return null;
        if (c <= 1) {
          clearInterval(t);
          onNext();
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, autoSkip, channel.id]);

  // Fullscreen state tracking
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    setShowControls(true);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      toast({ title: "Picture-in-picture is not supported here" });
    }
  }, [toast]);

  const copyLink = useCallback(() => {
    navigator.clipboard?.writeText(channel.url).then(
      () => toast({ title: "Stream link copied", description: "Paste it into VLC or any player" }),
      () => {}
    );
  }, [channel.url, toast]);

  const isRadio = /radio/i.test(channel.group);
  const showAudioViz = (audioOnly || isRadio) && phase === "playing";

  return (
    <div
      ref={containerRef}
      data-player-container
      className="relative w-full overflow-hidden bg-black aspect-video group select-none"
      onMouseMove={() => {
        setShowControls(true);
        if (!paused) scheduleHideControls();
      }}
      onMouseLeave={() => {
        if (!paused && phase === "playing") setShowControls(false);
      }}
      onTouchStart={() => {
        setShowControls((v) => !v);
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        poster={channel.logo || undefined}
        aria-label={`Now playing: ${channel.name}`}
      />

      {/* Audio-only / radio visual */}
      {showAudioViz && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none bg-gradient-to-br from-zinc-900/80 via-black/60 to-emerald-950/50">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-end gap-1.5 h-10" aria-hidden>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-emerald-400 animate-eq"
                  style={{ animationDelay: `${i * 0.12}s`, height: `${30 + ((i * 37) % 60)}%` }}
                />
              ))}
            </div>
            <p className="text-sm text-zinc-300">Audio channel — playing sound only</p>
          </div>
        </div>
      )}

      {/* Loading / buffering spinner */}
      {phase === "loading" && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-xs text-zinc-400">Connecting to {channel.name}…</p>
          </div>
        </div>
      )}

      {/* Unmute prompt */}
      {needsUnmute && phase === "playing" && (videoRef.current?.muted ?? false) && (
        <button
          onClick={() => {
            const v = videoRef.current;
            if (!v) return;
            v.muted = false;
            setMuted(false);
            setVolume(v.volume || 1);
            setNeedsUnmute(false);
          }}
          className="absolute inset-0 m-auto w-fit h-fit flex items-center gap-2 rounded-full bg-black/70 hover:bg-black/80 text-white pl-3 pr-5 py-2.5 text-sm backdrop-blur transition-colors z-20"
          aria-label="Turn on sound"
        >
          <VolumeX className="w-5 h-5 text-emerald-400" />
          Tap for sound
        </button>
      )}

      {/* Error overlay */}
      {phase === "error" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-zinc-950/95 p-4">
          <div className="flex flex-col items-center gap-4 text-center max-w-md">
            <div className="w-12 h-12 rounded-full bg-rose-500/15 grid place-items-center">
              <Signal className="w-6 h-6 text-rose-400" />
            </div>
            <div>
              <p className="font-semibold text-zinc-100">Can&apos;t play this channel right now</p>
              <p className="text-xs text-zinc-500 mt-1">{errorCode || "The stream did not respond"}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setRetryNonce((n) => n + 1)}>
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setModeOverride(effectiveMode === "direct" ? "proxy" : "direct");
                  setPhase("loading");
                }}
              >
                Try {effectiveMode === "direct" ? "proxy" : "direct"}
              </Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white" onClick={onNext}>
                Next channel <ChevronRight className="w-3.5 h-3.5 ml-1" />
              </Button>
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy link
              </Button>
            </div>
            {countdown !== null && (
              <p className="text-[11px] text-zinc-500">
                Auto-skipping to next channel in {countdown}s…
              </p>
            )}
            <label className="flex items-center gap-2 text-[11px] text-zinc-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoSkip}
                onChange={(e) => setAutoSkip(e.target.checked)}
                className="accent-emerald-500"
              />
              Auto-skip broken channels
            </label>
          </div>
        </div>
      )}

      {/* Top gradient + title (visible with controls) */}
      <div
        className={cn(
          "absolute top-0 inset-x-0 px-3 sm:px-4 pt-2.5 sm:pt-3 pb-8 bg-gradient-to-b from-black/80 to-transparent pointer-events-none transition-opacity",
          showControls || paused || phase !== "playing" ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <p className="truncate text-sm font-medium text-white/95">{channel.name}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={onClose}
              className="pointer-events-auto p-1.5 -mr-0.5 rounded-full hover:bg-white/20 text-white/90 hover:text-white transition-colors"
              aria-label="Close player"
              title="Close player"
            >
              <X className="w-5 h-5" />
            </button>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
                effectiveMode === "proxy"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              )}
              title={
                effectiveMode === "proxy"
                  ? "Playing through the built-in proxy (needed for streams that block direct browser access)"
                  : "Playing directly from the source server"
              }
            >
              {effectiveMode === "proxy" ? "PROXY" : "DIRECT"}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute bottom-0 inset-x-0 px-3 sm:px-4 pb-2.5 sm:pb-3 pt-10 bg-gradient-to-t from-black/85 to-transparent transition-opacity",
          showControls || paused || phase !== "playing" ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 text-white">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full hover:bg-white/15 transition-colors"
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-1 group/vol">
            <button
              onClick={() => setMuted(!muted)}
              className="p-2 rounded-full hover:bg-white/15 transition-colors"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-200 hidden sm:block">
              <Slider
                value={[muted ? 0 : Math.round(volume * 100)]}
                max={100}
                step={1}
                onValueChange={([v]) => {
                  setVolume(v / 100);
                  setMuted(v === 0);
                  if (v > 0) setNeedsUnmute(false);
                }}
                className="py-1"
                aria-label="Volume"
              />
            </div>
          </div>

          {buffering && phase === "playing" && (
            <Loader2 className="w-4 h-4 animate-spin text-zinc-400 ml-1" />
          )}

          <div className="flex-1" />

          {levels.length > 1 && (
            <DropdownMenu open={qualityOpen} onOpenChange={setQualityOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-2 rounded-full hover:bg-white/15 transition-colors"
                  aria-label="Quality"
                >
                  <Settings2 className="w-4.5 h-4.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                <DropdownMenuLabel className="text-xs">Quality</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (hlsRef.current) hlsRef.current.currentLevel = -1;
                  }}
                  className="text-xs justify-between"
                >
                  Auto {currentLevel === -1 || !levels.find((l) => l.index === currentLevel) ? <Check className="w-3 h-3" /> : null}
                </DropdownMenuItem>
                {levels.map((l) => (
                  <DropdownMenuItem
                    key={l.index}
                    onClick={() => {
                      if (hlsRef.current) hlsRef.current.currentLevel = l.index;
                    }}
                    className="text-xs justify-between"
                  >
                    {l.label} {currentLevel === l.index ? <Check className="w-3 h-3" /> : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <button
            onClick={togglePiP}
            className="p-2 rounded-full hover:bg-white/15 transition-colors hidden sm:block"
            aria-label="Picture in picture"
          >
            <PictureInPicture2 className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full hover:bg-white/15 transition-colors"
            aria-label="Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
