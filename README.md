# BDIX TV — Live IPTV Web Player

A fast, mobile-friendly web app for watching the [Mrgify BDIX IPTV](https://github.com/abusaeeidx/Mrgify-BDIX-IPTV) playlist — 300+ live TV channels (Bangladeshi + international) with automatic working-status checks and instant channel zapping.

## Features

- **Everything plays in the browser** — HLS playback via [hls.js](https://github.com/video-dev/hls.js), with a built-in Edge proxy for streams that block direct browser access (CORS) or serve over plain HTTP.
- **Working / Down status for every channel** — streams are health-checked automatically (m3u8 manifests are actually parsed, not just pinged). Results are cached at the CDN edge, so checks are fast and don't hammer upstream servers.
- **Instant channel switching** — click any channel, use ← / → keyboard zapping, or the "Quick switch" strip under the player. Auto-advance past broken channels with the *auto-skip* option.
- **Always in sync** — the playlist is fetched from the source repository at runtime (never baked into the build). Daily M3U updates appear automatically within minutes; no redeploy needed.
- **Custom playlists — by link OR by uploading a .m3u / .m3u8 file** — sign-in users can extend the channel grid with their own playlists. Uploaded files are stored privately per user (see **Privacy** below); no other user can ever read or play them.
- **Search, categories, favorites, recents** — find channels fast, mark favorites, and continue where you left off (stored locally in your browser, and backed up to your account when signed in).
- **PWA** — install it on your phone/home screen like a native TV app.
- **Smart fallbacks** — direct playback → proxy → clear error with retry / copy-link / next-channel actions. Radio channels get an audio-only mode.

> Status badges reflect checks made **from our server** (currently outside Bangladesh). Some BDIX-only streams may still play on local Bangladeshi connections even when marked down — the app always lets you try.

## Privacy — uploaded M3U files

Custom M3U links are stored only in your browser (and your account's metadata when signed in). When you upload an M3U / M3U8 file:

- The file content is stored in a per-user `user_files` table with an `ON DELETE CASCADE` foreign key to `users`.
- Every read (`GET /api/playlist/upload?id=…`) and delete (`DELETE …`) is scoped to the authenticated session's `user_id` — the SQL query always contains `WHERE user_id = $1`. A non-owner always gets a 404, so even the existence of another user's file is never disclosed.
- File ids are random UUIDs (`crypto.randomUUID()`), never enumerated from a list.
- Responses from the upload endpoints are served with `Cache-Control: no-store` so nothing is cached at any CDN edge.
- When a user removes a file-kind playlist, both the playlist metadata (via the regular data sync) and the underlying `user_files` row (via the explicit DELETE) are removed; orphaned files are also garbage-collected automatically on the next `PUT /api/user/data`.
- When a user account is deleted, the FK CASCADE drops all their files automatically — nothing leaks.

## Tech

- Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui
- Zustand (state, localStorage persistence) + TanStack Query (data sync)
- hls.js player with direct/proxy auto-fallback
- API routes: `/api/playlist` (runtime M3U fetch + cache), `/api/playlist/custom` (parse a user-supplied M3U URL server-side), `/api/playlist/upload` (upload / fetch / delete private per-user M3U files), `/api/check` (stream health), `/api/proxy` (CORS/HTTP stream proxy with m3u8 rewriting)

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

The repo is Vercel-ready (`vercel --prod` or import via the dashboard). The core player needs no database — the M3U playlist is fetched at runtime. Optional user accounts (sign in at `/login`) back up favorites, custom playlists and preferences to **Neon Postgres** from the project's Vercel Storage (`AUTH_DATABASE_URL`). The stream proxy runs as a Node Function.

## Developer

**Ayman Chowdhury** — [aymann.is-a.dev](https://aymann.is-a.dev)

<p>
  <img src="https://res.cloudinary.com/ne2uunmx/image/upload/v1791478541/portfolio/whtrhrg0fdrd8qedfgso.jpg" alt="Ayman Chowdhury" width="96" align="left" style="border-radius:9999px;margin-right:12px" />
  Built BDIX TV — a fast, ad-free player for live Bangladeshi television.
</p>

## Disclaimer

This project is a player/UI only. It hosts no content — all streams come from the public Mrgify BDIX IPTV playlist and belong to their respective owners.
