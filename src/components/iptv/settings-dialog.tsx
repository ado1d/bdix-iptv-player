"use client";

/**
 * Settings dialog: manage playlists + playback options.
 *  - Shows the built-in playlist and every user-added M3U link
 *  - Add: paste an M3U/M3U8 URL (+ optional name) → channels merge into the grid
 *  - Per-playlist status (loading / error with retry / synced), remove & rename
 *  - Playback: connection mode (auto/direct/proxy) + auto-skip broken channels
 * Open state lives in the global store so any button (header gear, mobile
 * "Add playlist" chip) can open it.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Rss,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { useIPTV } from "@/store/iptv-store";
import { customPlaylistQueryKey } from "./custom-sync";
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
            Add your own M3U / M3U8 playlist links — their channels merge into the main
            list, get health-checked and stay auto-synced, just like the built-in playlist.
          </DialogDescription>
        </DialogHeader>

        <PlaylistManager />
        <PlaybackSettings />
      </DialogContent>
    </Dialog>
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
        Playlists are stored in your browser and refreshed automatically. Duplicate
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
    try {
      return new URL(playlist.url).hostname;
    } catch {
      return playlist.url;
    }
  })();

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
            : "bg-violet-500/10 text-violet-600 dark:text-violet-400"
        )}
      >
        {loading ? (
          <Loader2 className="w-4.5 h-4.5 animate-spin" />
        ) : error ? (
          <TriangleAlert className="w-4.5 h-4.5" />
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
            {(error || !loading) && (
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
  const addPlaylist = useIPTV((s) => s.addCustomPlaylist);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = addPlaylist(url, name);
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

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3"
    >
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
