/**
 * M3U / M3U8 playlist parser and shared types.
 * Used by both server (API routes) and client.
 */

export interface Channel {
  /** Stable id derived from the stream URL (survives playlist refreshes) */
  id: string;
  name: string;
  group: string;
  logo: string;
  tvgId: string;
  url: string;
  /** Which playlist this channel came from ("" = built-in default playlist) */
  sourceId?: string;
  /** Display name of the source playlist (custom playlists only) */
  sourceName?: string;
}

export interface GroupInfo {
  name: string;
  count: number;
}

export interface PlaylistData {
  total: number;
  /** "Last Updated" string parsed from the playlist header comments (BD time) */
  updatedAt: string | null;
  /** When our server last fetched the source */
  fetchedAt: string;
  sourceUrl: string;
  groups: GroupInfo[];
  channels: Channel[];
}

/** Response shape of /api/playlist/custom */
export interface CustomPlaylistData {
  total: number;
  updatedAt: string | null;
  fetchedAt: string;
  channels: Channel[];
}

/** djb2-ish string hash -> short base36 id (stable, no crypto needed) */
export function hashId(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = (h1 ^ c) * 16777619;
    h2 = (h2 + c * (i + 7)) * 2654435761;
    h1 >>>= 0;
    h2 >>>= 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12);
}

/** Normalize odd schemes so the browser can actually fetch the stream */
export function normalizeStreamUrl(url: string): string {
  return url.replace(/^hls:\/\//i, "https://").replace(/^rtsps?:\/\//i, "https://");
}

export function isPlayableProtocol(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** true when the browser can never play this inline (rtmp/udp/rtp…) */
export function isExternalOnly(url: string): boolean {
  return !isPlayableProtocol(normalizeStreamUrl(url)) || /^(rtmp|rtsp|udp|rtp|mms):/i.test(url);
}

/**
 * Parse #EXTM3U content into channels.
 * Handles attributes (tvg-name, tvg-logo, group-title, tvg-id), comment
 * headers, and oddities such as trailing spaces / CRLF / missing names.
 */
export function parseM3U(content: string): { channels: Channel[]; updatedAt: string | null } {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  let pending: Omit<Channel, "url" | "id"> | null = null;

  let updatedAt: string | null = null;
  const updatedMatch = content.match(/#\s*Last Updated:\s*([^\r\n]+)/i);
  if (updatedMatch) updatedAt = updatedMatch[1].trim();

  const attrRegex = /([A-Za-z0-9_-]+)="([^"]*)"/g;

  const seen = new Map<string, number>(); // url -> index in channels
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith("#EXTINF")) {
      const attrs: Record<string, string> = {};
      let m: RegExpExecArray | null;
      attrRegex.lastIndex = 0;
      while ((m = attrRegex.exec(line)) !== null) {
        attrs[m[1].toLowerCase()] = m[2];
      }
      const commaIdx = line.lastIndexOf(",");
      let name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : "";
      if (!name) name = attrs["tvg-name"] || "";
      if (name.length > 120) name = name.slice(0, 117) + "…"; // guard against absurd names
      pending = {
        name: name || "Unknown Channel",
        group: (attrs["group-title"] || "Ungrouped").trim() || "Ungrouped",
        logo: attrs["tvg-logo"] || "",
        tvgId: attrs["tvg-id"] || "",
      };
    } else if (!line.startsWith("#")) {
      // A URL line
      if (pending) {
        const url = normalizeStreamUrl(line);
        const existing = seen.get(url);
        if (existing !== undefined) {
          // Duplicate stream URL — upgrade metadata if the later entry is richer
          const prev = channels[existing];
          if (!prev.logo && pending.logo) prev.logo = pending.logo;
          if (prev.name === "Unknown Channel" && pending.name !== "Unknown Channel") {
            prev.name = pending.name;
            prev.group = pending.group;
            prev.tvgId = pending.tvgId;
          }
        } else {
          seen.set(url, channels.length);
          channels.push({ ...pending, url, id: hashId(url) });
        }
        pending = null;
      } else if (/^https?:\/\//i.test(normalizeStreamUrl(line))) {
        // URL without EXTINF — keep it with a placeholder name
        const url = normalizeStreamUrl(line);
        if (!seen.has(url)) {
          seen.set(url, channels.length);
          channels.push({
            id: hashId(url),
            name: url.split("/").pop()?.split("?")[0] || "Unknown Channel",
            group: "Ungrouped",
            logo: "",
            tvgId: "",
            url,
          });
        }
      }
    }
  }

  return { channels, updatedAt };
}

/** Build group summary sorted by size (desc) */
export function buildGroups(channels: Channel[]): GroupInfo[] {
  const map = new Map<string, number>();
  for (const c of channels) {
    map.set(c.group, (map.get(c.group) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
