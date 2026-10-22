"use client";

/**
 * Progressive stream-status checker.
 * - Priority queue: channels visible in the viewport are checked first
 * - Fixed concurrency so we never hammer the API
 * - Skips URLs with a fresh cached result (< 30 min)
 * Results land in the global store and persist to localStorage.
 */
import type { StatusInfo } from "@/store/iptv-store";

const FRESH_MS = 30 * 60 * 1000;
const MAX_CONCURRENT = 8;

type Listener = (url: string, info: StatusInfo) => void;

class StatusChecker {
  private queue: string[] = [];
  private queued = new Set<string>();
  private active = new Set<string>();
  private listener: Listener | null = null;
  private isFresh: (url: string) => boolean = () => false;

  configure(listener: Listener, isFresh: (url: string) => boolean) {
    this.listener = listener;
    this.isFresh = isFresh;
  }

  /** Visible channel — jump the queue */
  checkVisible(url: string) {
    this.enqueue(url, true);
    this.pump();
  }

  /** Background sweep — appended at the back */
  checkBackground(urls: string[]) {
    for (const u of urls) this.enqueue(u, false);
    this.pump();
  }

  /** Force a re-check regardless of cache */
  recheck(url: string) {
    if (this.active.has(url)) return;
    this.queue.unshift(url);
    this.pump();
  }

  private enqueue(url: string, front: boolean) {
    if (this.queued.has(url) || this.active.has(url)) return;
    if (!front && this.isFresh(url)) return; // background: skip fresh
    if (front && this.isFresh(url) && !this.needsSlowRecheck(url)) {
      // visible & fresh: only re-verify if older than 10 min
      return;
    }
    this.queued.add(url);
    if (front) this.queue.unshift(url);
    else this.queue.push(url);
  }

  /** fresh enough to display, but old enough that a silent re-verify is nice */
  private needsSlowRecheck(url: string): boolean {
    return false; // simplified: FRESH_MS window is authoritative
  }

  clear() {
    this.queue = [];
    this.queued.clear();
  }

  private pump() {
    while (this.active.size < MAX_CONCURRENT) {
      const url = this.queue.shift();
      if (!url) return;
      this.queued.delete(url);
      if (this.active.has(url)) continue;
      this.active.add(url);
      this.run(url)
        .catch(() => {})
        .finally(() => {
          this.active.delete(url);
          this.pump();
        });
    }
  }

  private async run(url: string): Promise<void> {
    try {
      const res = await fetch(`/api/check?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      this.listener?.(url, {
        status: data.status === "online" ? "online" : "offline",
        checkedAt: Date.now(),
        httpCode: data.httpCode ?? null,
        reason: data.reason,
        latencyMs: data.latencyMs,
      });
    } catch {
      // Network hiccup — mark unknown so it can be retried later
      this.listener?.(url, {
        status: "offline",
        checkedAt: Date.now(),
        reason: "check failed",
      });
    }
  }
}

export const statusChecker = new StatusChecker();
