# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (starts Vite dev server + Tauri hot-reload)
npm run tauri dev

# Production build
npm run tauri build

# Frontend only (no Tauri window)
npm run dev

# Checks
npx tsc --noEmit                    # or: node node_modules/typescript/bin/tsc --noEmit
cd src-tauri && cargo test --lib    # Rust unit tests (lib.rs, osu_parse.rs, media_server.rs)
```

There is no linter and no frontend test suite.

On Linux, Tauri needs `libwebkit2gtk-4.1-dev` and friends, and media playback needs the GStreamer plugins `gstreamer1.0-plugins-good` (MP3) and `gstreamer1.0-libav` (H.264 video).

## Architecture

This is a **Tauri 2.0** desktop app: a Rust backend (`src-tauri/`) communicates with a React 18 + TypeScript frontend (`src/`) via Tauri's `invoke` IPC bridge.

### Data flow

1. On startup, `App.tsx` (`loadOrScan`) takes the Songs folder from the store, or asks `default_songs_folder`. It then tries `load_tracks_cache` (`<appLocalDataDir>/tracks-cache.json`, valid while `CACHE_VERSION` and the newest mtime among the Songs folder's entries are unchanged) and falls back to `scan_osu_songs` followed by `save_tracks_cache`.
2. Tracks land in the **Zustand store** (`src/stores/playerStore.ts`), the single source of truth for UI state. Persisted to `localStorage` (key `osu-player-storage`): songs folder, volume, shuffle, repeat, theme, favorites, playlists, and the sphere video option below. `predictNextTrack` is the one place that decides which track "next" plays; the preloader relies on it.
3. **`useAudio`** (`src/hooks/useAudio.ts`) plays each track through a native `HTMLAudioElement` (not Howler: in html5 mode Howler freezes the duration at the first load event and ends tracks on a timer, which broke on WebKitGTK). It preloads the predicted next track one second after a track starts, and polls every 500 ms to push `progress` and `audioTime` into the store with `setPlayback`.
4. Media URLs come from `localMediaUrl` (`src/lib/localMedia.ts`): Tauri's `asset://` protocol on Windows and macOS. On Linux, WebKitGTK cannot play `<audio>`/`<video>` from `asset://` and mis-plays some MP3s loaded as blobs, so the backend serves media over a local HTTP server instead (see below).
5. **`BeatmapVideo`** (`src/components/BeatmapVideo/`) shows the beatmap video, muted, in place of the blurred background in `PlayerBar` and `SphereView`, and large in `Stage` when the library is hidden (`PlayerBar` then shows the image, so the video is decoded once). It follows `audioTime` minus the beatmap's video offset, re-seeking only beyond 0.2 s of drift; `useVideoTrack` hands back to the background image if the video can't be played. In sphere mode, `hideSphereControlsOverVideo` (Settings → Videos, on by default) fades the list and controls out while the pointer is away from the sphere, with a plain CSS `:hover`.
6. **`useTheme`** (`src/hooks/useTheme.ts`) applies the active theme by writing CSS custom properties directly onto `document.documentElement`. The four built-in themes are defined inline in that hook; the JSON files in `themes/` are not loaded.

The Library and sphere track lists are virtualized by `useVirtualRows`: only visible rows are mounted, so row heights are fixed (`TRACK_ROW_HEIGHT`, `SPHERE_TRACK_HEIGHT`) and must match the rendered CSS height.

### Rust backend (`src-tauri/src/`)

Commands registered in `lib.rs`:
- `scan_osu_songs(folder_path)` — walks up to 3 levels deep, keeps audio files that pass `is_main_audio` (excludes osu! hitsounds by name), reads ID3 tags for MP3s with a fallback to the folder name (`"<id> Artist - Title"`), reads background, dominant BPM and video (with its offset) from the first `.osu` file, falls back to a loose `.mp4`/`.m4v`/`.webm` in the folder, and drops tracks outside 30–600 s.
- `default_songs_folder()` — first existing osu! Songs folder: `C:\osu!\Songs`, `%LOCALAPPDATA%` and every drive letter on Windows; Wine prefixes and `/mnt/*` (WSL) on Linux.
- `load_tracks_cache` / `save_tracks_cache` — the metadata cache. Bump `CACHE_VERSION` whenever `Track` gains a field, or old caches keep being served without it.
- `set_sphere_mode(enabled)` — resizes the window in logical pixels (360×360 sphere, 380×580 normal), lifting the config's minimum size and resizability while in sphere mode.
- `media_base_url()` — the Linux media server's base URL, `null` elsewhere.

Commands that touch the disk are declared `#[tauri::command(async)]`: a synchronous command runs on the main thread, which also drives the window, and froze it during a scan.

`osu_parse.rs` holds the pure `.osu` parsers (`parse_dominant_bpm`, `parse_background_filename`, `parse_video`). `media_server.rs` (Linux only) is a standard-library HTTP server with `Range` support: it listens on 127.0.0.1 on a random port, requires a random token in every URL and an exact `Host` header, and only serves files the asset protocol scope allows.

### Key constraints

- The window is **frameless and transparent** (`decorations: false, transparent: true` in `tauri.conf.json`). The titlebar drags through `data-tauri-drag-region`, which only reacts to the exact element clicked. In sphere mode, `SphereView` starts the drag itself with `startDragging()` from any free point, buttons and tracks excluded.
- The asset protocol scope is split per OS (`tauri.windows.conf.json`: `C:\**`, `$HOME\**`; `tauri.linux.conf.json`: `$HOME`, `/mnt`, `/media`, `/run/media`). On top of that, `allow_songs_folder` adds the chosen Songs folder at runtime, which covers other drives (`S:\`) and hidden Wine prefixes that Unix globs exclude by default. The Linux media server checks the same scope.
- `SphereView.css` uses no hard-coded colors: theme variables plus `--glint` and `--shade` from `src/styles/globals.css`, derived with `color-mix`.
- The `@` alias in `vite.config.ts` resolves to `./src`, used throughout imports.
- Vite dev server is locked to port **1420** (Tauri's configured `devUrl`).
