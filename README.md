# BDIX TV — Live IPTV Web Player

A fast, mobile-friendly web app for watching the [Mrgify BDIX IPTV](https://github.com/abusaeeidx/Mrgify-BDIX-IPTV) playlist — 300+ live TV channels (Bangladeshi + international) with automatic working-status checks and instant channel zapping.

## Features

- **Everything plays in the browser** — HLS playback via [hls.js](https://github.com/video-dev/hls.js), with a built-in Edge proxy for streams that block direct browser access (CORS) or serve over plain HTTP.
- **Working / Down status for every channel** — streams are health-checked automatically (m3u8 manifests are actually parsed, not just pinged). Results are cached at the CDN edge, so checks are fast and don't hammer upstream servers.
- **Instant channel switching** — click any channel, use ← / → keyboard zapping, or the "Quick switch" strip under the player. Auto-advance past broken channels with the *auto-skip* option.
- **Always in sync** — the playlist is fetched from the source repository at runtime (never baked into the build). Daily M3U updates appear automatically within minutes; no redeploy needed.
- **Search, categories, favorites, recents** — find channels fast, mark favorites, and continue where you left off (stored locally in your browser).
- **PWA** — install it on your phone/home screen like a native TV app.
- **Smart fallbacks** — direct playback → proxy → clear error with retry / copy-link / next-channel actions. Radio channels get an audio-only mode.

> Status badges reflect checks made **from our server** (currently outside Bangladesh). Some BDIX-only streams may still play on local Bangladeshi connections even when marked down — the app always lets you try.

## Tech

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Zustand (state, localStorage persistence) + TanStack Query (data sync)
- hls.js player with direct/proxy auto-fallback
- API routes: `/api/playlist` (runtime M3U fetch + cache), `/api/check` (stream health), `/api/proxy` (CORS/HTTP stream proxy with m3u8 rewriting)

## Local development

```bash
bun install
bun run dev
```

Optional environment variables (`.env`):

```
M3U_URL=https://raw.githubusercontent.com/abusaeeidx/Mrgify-BDIX-IPTV/main/playlist.m3u
```

## Deployment (Vercel)

The repo is Vercel-ready (`vercel --prod` or import via the dashboard). No database or extra services required. The stream proxy runs as an Edge Function.

## Developer

**Ayman Chowdhury** — [aymann.is-a.dev](https://aymann.is-a.dev)

<p>
  <img src="https://res.cloudinary.com/ne2uunmx/image/upload/v1791478541/portfolio/whtrhrg0fdrd8qedfgso.jpg" alt="Ayman Chowdhury" width="96" align="left" style="border-radius:9999px;margin-right:12px" />
  Built BDIX TV — a fast, ad-free player for live Bangladeshi television.
</p>

## Disclaimer

This project is a player/UI only. It hosts no content — all streams come from the public Mrgify BDIX IPTV playlist and belong to their respective owners.
