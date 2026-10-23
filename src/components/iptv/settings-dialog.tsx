"use client";

/**
 * Settings dialog: manage playlists + playback options.
 *  - Shows the built-in playlist and every user-added M3U link or file
 *  - Add by URL: paste an M3U/M3U8 URL (+ optional name) → channels merge into the grid
 *  - Add by file: upload a .m3u/.m3u8 file (signed-in users only) — stored
 *    privately on the server, scoped to the user
 *  - Per-playlist status (loading / error with retry / synced), remove & rename
 *  - Playback: connection mode (auto/direct/proxy) + auto-skip broken channels
 * Open state lives in the global store so any button (header gear, mobile
 * "Add playlist" chip) can open it.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CloudUpload,
  FileUp,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useIPTV } from "@/store/iptv-store";
import { customPlaylistQueryKey } from "./custom-sync";
import { DeveloperCard } from "./developer-card";
import { pushUserData, signOutEverywhere } from "./auth-sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function SettingsDialog() {
  const open = useIPTV((s) => s.settingsOpen);
  const setOpen = useIPTV((s) => s.setSettingsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto thin-scrollbar rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rss className="w-4.5 h-4.5 text-emerald-500" /> Playlists
          </DialogTitle>
          <DialogDescription>
            Add your own M3U / M3U8 playlists — by link or by uploading a file —
            their channels merge into the main list, get health-checked and stay
            auto-synced, just like the built-in playlist.
          </DialogDescription>
        </DialogHeader>

        <AccountSection />
        <PlaylistManager />
        <PlaybackSettings />
        <AboutSection />
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Account ---------------- */

function AccountSection() {
  const user = useIPTV((s) => s.authUser);
  const syncStatus = useIPTV((s) => s.syncStatus);
  const lastSyncedAt = useIPTV((s) => s.lastSyncedAt);
  const setOpen = useIPTV((s) => s.setSettingsOpen);

  if (!user) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] px-3 py-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 shrink-0">
          <ShieldCheck className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Save your stuff with a free account</p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Favorites, playlists & settings backed up — safe even if your browser data is cleared.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white shrink-0"
          onClick={() => setOpen(false)}
        >
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  const rel = lastSyncedAt
    ? Date.now() - lastSyncedAt < 60_000
      ? "just now"
      : `${Math.round((Date.now() - lastSyncedAt) / 60000)} min ago`
    : null;

  const initials = (user.name.trim() || user.email)
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2.5">
      <span className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white text-xs font-bold shrink-0">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{user.name || "Viewer"}</p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
          {syncStatus === "saved" && rel ? `Backed up · ${rel}` : syncStatus === "syncing" ? "Backing up…" : syncStatus === "error" ? "Backup failed — will retry" : "Auto-backup on"}
        </p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" className="h-8" onClick={() => pushUserData()} disabled={syncStatus === "syncing"}>
          {syncStatus === "syncing" ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5 mr-1" />}
          Back up
        </Button>
        <Button size="sm" variant="ghost" className="h-8 hover:text-rose-500" onClick={() => signOutEverywhere()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Playlists ---------------- */

function PlaylistManager() {
  const playlists = useIPTV((s) => s.customPlaylists);
  const defaultCount = useIPTV((s) => s.defaultChannels.length);
  const playlistUpdatedAt = useIPTV((s) => s.playlistUpdatedAt);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Built-in playlist */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 px-3 py-2.5">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 shrink-0">
          <Rss className="w-4.5 h-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium flex items-center gap-2">
            Mrgify BDIX IPTV
            <span className="rounded-full bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-px text-[10px] font-semibold">
              Built-in
            </span>
          </p>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
            {defaultCount > 0 ? `${defaultCount} channels` : "loading…"}
            {playlistUpdatedAt && <span> · updated {playlistUpdatedAt}</span>}
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          <Check className="w-3.5 h-3.5" /> synced
        </span>
      </div>

      {/* User playlists */}
      {playlists.map((p) => (
        <PlaylistRow key={p.id} id={p.id} />
      ))}

      <AddPlaylistForm />

      <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        Playlists are stored in your browser and refreshed automatically. Uploaded files
        are kept private to your account — no other user can see or play them. Duplicate
        channels already in the built-in list are shown only once.
      </p>
    </div>
  );
}

function PlaylistRow({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const playlist = useIPTV((s) => s.customPlaylists.find((p) => p.id === id));
  const status = useIPTV((s) => s.customStatus[id]);
  const addedCount = useIPTV((s) => s.channels.reduce((n, c) => (c.sourceId === id ? n + 1 : n), 0));
  const removePlaylist = useIPTV((s) => s.removeCustomPlaylist);
  const renamePlaylist = useIPTV((s) => s.renameCustomPlaylist);
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  if (!playlist) return null;
  const loading = status?.loading;
  const error = status?.error ?? null;
  const count = status?.count ?? 0;

  const retry = () => {
    queryClient.invalidateQueries({ queryKey: customPlaylistQueryKey(playlist) });
    toast({ title: "Retrying…", description: `Fetching ${playlist.name} again` });
  };

  const remove = () => {
    removePlaylist(id);
    queryClient.removeQueries({ queryKey: ["custom-playlist", id] });
    toast({ title: "Playlist removed", description: `${count} channels were taken out of your list` });
  };

  const host = (() => {
    if (playlist.kind === "file") return "Uploaded file · private to you";
    try {
      return new URL(playlist.url).hostname;
    } catch {
      return playlist.url;
    }
  })();

  const isFile = playlist.kind === "file";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2.5",
        error
          ? "border-rose-500/30 bg-rose-500/[0.04]"
          : "border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60"
      )}
    >
      <span
        className={cn(
          "grid place-items-center w-9 h-9 rounded-lg shrink-0",
          error
            ? "bg-rose-500/10 text-rose-500"
            : isFile
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
        )}
      >
        {loading ? (
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
        ) : error ? (
          <TriangleAlert className="w-4.5 h-4.5" />
        ) : isFile ? (
          <FileUp className="w-4.5 h-4.5" />
        ) : (
          <Link2 className="w-4.5 h-4.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              renamePlaylist(id, nameDraft);
              setEditing(false);
            }}
          >
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-8 text-sm"
              maxLength={60}
              placeholder="Playlist name"
            />
            <Button type="submit" size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white">
              Save
            </Button>
          </form>
        ) : (
          <>
            <p className="text-sm font-medium truncate" title={playlist.name}>
              {playlist.name}
            </p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate" title={playlist.url}>
              {host}
              {loading
                ? " · loading…"
                : error
                  ? ""
                  : ` · ${count} channels${addedCount > 0 && addedCount < count ? ` (${addedCount} new)` : ""}${status?.updatedAt ? ` · updated ${status.updatedAt}` : ""}`}
            </p>
            {error && <p className="text-[11px] text-rose-500 mt-0.5">{error}</p>}
          </>
        )}
      </div>

      <div className="flex items-center gap-0.5 shrink-0">
        {editing ? (
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)} aria-label="Cancel rename">
            <X className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <>
            {!editing && (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setNameDraft(playlist.name);
                  setEditing(true);
                }}
                aria-label="Rename playlist"
                title="Rename"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {(error || (!loading && !isFile)) && (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={retry} aria-label="Refetch playlist" title="Refetch">
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 hover:text-rose-500"
              onClick={remove}
              aria-label="Remove playlist"
              title="Remove"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function AddPlaylistForm() {
  const addUrlPlaylist = useIPTV((s) => s.addCustomPlaylist);
  const addFilePlaylist = useIPTV((s) => s.addFilePlaylist);
  const authUser = useIPTV((s) => s.authUser);
  const setOpen = useIPTV((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addUrlPlaylist(url, name);
    if (!res.ok) {
      toast({
        title: res.duplicate ? "Already added" : "Couldn't add that",
        description: res.error,
        variant: res.duplicate ? "default" : "destructive",
      });
      return;
    }
    toast({ title: "Playlist added", description: "Fetching its channels now…" });
    setUrl("");
    setName("");
  };

  const onPickFile = (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Keep M3U files under 16 MB",
        variant: "destructive",
      });
      return;
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".m3u") && !lower.endsWith(".m3u8")) {
      toast({
        title: "Wrong file type",
        description: "Pick a .m3u or .m3u8 playlist file",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    // Pre-fill name with the file name (without extension)
    if (!fileName) {
      setFileName(file.name.replace(/\.(m3u8?|M3U8?)$/i, "").trim());
    }
  };

  const uploadFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUser) {
      toast({
        title: "Sign in first",
        description: "Uploaded files are stored privately to your account",
        variant: "destructive",
      });
      return;
    }
    if (!selectedFile) {
      toast({
        title: "Pick a file",
        description: "Choose a .m3u or .m3u8 file to upload",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      if (fileName.trim()) fd.append("name", fileName.trim().slice(0, 60));
      const res = await fetch("/api/playlist/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Upload failed (${res.status})`);
      }
      const { id, name: serverName, count } = body as {
        id: string;
        name: string;
        count: number;
      };
      const addRes = addFilePlaylist(id, serverName || fileName, count);
      if (!addRes.ok) {
        toast({
          title: addRes.duplicate ? "Already added" : "Couldn't add that",
          description: addRes.error,
          variant: addRes.duplicate ? "default" : "destructive",
        });
        // If add failed because of a duplicate, the uploaded file is now
        // orphaned — schedule a cleanup by triggering a user-data push.
        return;
      }
      toast({
        title: "File uploaded",
        description: `${count} channels added from "${serverName}" — only you can see them`,
      });
      // Reset form
      setSelectedFile(null);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Trigger backup so the new playlist metadata lands on the server
      // alongside favorites/recents.
      try {
        const { pushUserData } = await import("./auth-sync");
        await pushUserData();
      } catch {
        /* best-effort — the autosync watcher will pick it up */
      }
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3">
      {/* Tabs: URL / Upload file */}
      <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label="Add playlist by">
        <button
          role="tab"
          aria-selected={tab === "url"}
          onClick={() => setTab("url")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
            tab === "url"
              ? "border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-emerald-500/40"
          )}
        >
          <Link2 className="w-3.5 h-3.5" /> By link
        </button>
        <button
          role="tab"
          aria-selected={tab === "file"}
          onClick={() => setTab("file")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
            tab === "file"
              ? "border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
              : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-emerald-500/40"
          )}
        >
          <FileUp className="w-3.5 h-3.5" /> Upload file
        </button>
      </div>

      {tab === "url" ? (
        <form onSubmit={submitUrl} className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label htmlFor="pl-url" className="sr-only">
                Playlist URL
              </Label>
              <Input
                id="pl-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="h-9 text-sm"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="sm:w-40">
              <Label htmlFor="pl-name" className="sr-only">
                Name (optional)
              </Label>
              <Input
                id="pl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name (optional)"
                className="h-9 text-sm"
                maxLength={60}
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={!url.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white h-9"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Add playlist
          </Button>
        </form>
      ) : (
        <form onSubmit={uploadFile} className="flex flex-col gap-2">
          {!authUser && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">Sign in to upload files</p>
                <p className="opacity-90">Files are stored privately to your account so no other user can see them.</p>
              </div>
              <Button
                asChild
                size="sm"
                variant="outline"
                className="h-7 shrink-0"
                onClick={() => setOpen(false)}
              >
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          )}

          {/* Drop zone / file picker */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onPickFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-4 text-center cursor-pointer transition-colors",
              dragOver
                ? "border-emerald-500 bg-emerald-500/[0.04]"
                : "border-zinc-300 dark:border-zinc-700 hover:border-emerald-500/40"
            )}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            <FileUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs font-medium">
              {selectedFile ? (
                <span className="text-emerald-700 dark:text-emerald-400">
                  {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              ) : (
                "Drop .m3u / .m3u8 here or click to pick"
              )}
            </p>
            <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
              Up to 16 MB · only you can see what you upload
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".m3u,.m3u8,audio/x-mpegurl,audio/mpegurl,application/vnd.apple.mpegurl,text/plain"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0])}
            />
          </div>

          {/* Optional name */}
          <div>
            <Label htmlFor="pl-file-name" className="sr-only">
              Name (optional)
            </Label>
            <Input
              id="pl-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="Name (optional)"
              className="h-9 text-sm"
              maxLength={60}
              disabled={!authUser}
            />
          </div>

          <Button
            type="submit"
            disabled={!authUser || !selectedFile || uploading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white h-9"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Uploading…
              </>
            ) : (
              <>
                <FileUp className="w-4 h-4 mr-1.5" /> Upload &amp; add
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}

/* ---------------- About ---------------- */

function AboutSection() {
  return (
    <div className="flex flex-col gap-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800 mt-2">
      <p className="text-sm font-semibold">About</p>
      <DeveloperCard />
      <p className="text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
        BDIX TV — a fast, ad-free player for live Bangladeshi television. Built
        with love, kept in sync with the Mrgify BDIX playlist every day.
      </p>
    </div>
  );
}

/* ---------------- Playback ---------------- */

function PlaybackSettings() {
  const playMode = useIPTV((s) => s.playMode);
  const setPlayMode = useIPTV((s) => s.setPlayMode);
  const autoSkip = useIPTV((s) => s.autoSkip);
  const setAutoSkip = useIPTV((s) => s.setAutoSkip);

  const modes: { value: "auto" | "direct" | "proxy"; label: string; hint: string }[] = [
    { value: "auto", label: "Auto", hint: "Direct first, proxy as fallback (recommended)" },
    { value: "direct", label: "Direct", hint: "Always connect straight to the stream server" },
    { value: "proxy", label: "Proxy", hint: "Always route through the built-in proxy" },
  ];

  return (
    <div className="flex flex-col gap-3 pt-2 border-t border-zinc-200 dark:border-zinc-800 mt-2">
      <div>
        <p className="text-sm font-semibold mb-2">Playback</p>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Connection mode">
          {modes.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={playMode === m.value}
              title={m.hint}
              onClick={() => setPlayMode(m.value)}
              className={cn(
                "rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                playMode === m.value
                  ? "border-emerald-600 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
                  : "border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-emerald-500/40"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
          {modes.find((m) => m.value === playMode)?.hint}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Label htmlFor="autoskip" className="text-sm font-medium cursor-pointer">
            Auto-skip broken channels
          </Label>
          <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
            Jump to the next channel when a stream fails
          </p>
        </div>
        <Switch id="autoskip" checked={autoSkip} onCheckedChange={setAutoSkip} />
      </div>
    </div>
  );
}
