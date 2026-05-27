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
```

There are no tests or linters configured.

## Architecture

This is a **Tauri 2.0** desktop app: a Rust backend (`src-tauri/`) communicates with a React 18 + TypeScript frontend (`src/`) via Tauri's `invoke` IPC bridge.

### Data flow

1. On startup, `App.tsx` calls `invoke('scan_osu_songs', { folderPath })` → Rust walks the osu! Songs directory, reads ID3 tags and `.osu` files, returns a `Vec<Track>` serialized as JSON.
2. Tracks land in the **Zustand store** (`src/stores/playerStore.ts`), which is the single source of truth for all UI state. A subset of state (folder path, volume, shuffle, repeat, theme) is persisted to `localStorage` via the `persist` middleware under the key `osu-player-storage`.
3. **`useAudio`** (`src/hooks/useAudio.ts`) owns the Howler.js instance. It watches `currentTrack` from the store, creates a new `Howl` on each track change using `convertFileSrc(track.path)` (Tauri's asset protocol), and drives `status`/`progress` back into the store via a 500ms polling interval.
4. **`useTheme`** (`src/hooks/useTheme.ts`) applies the active theme by writing CSS custom properties directly onto `document.documentElement`. The four built-in themes are defined inline in that hook; there is no external theme file loading yet.

### Rust backend (`src-tauri/src/lib.rs`)

Three Tauri commands are registered:
- `scan_osu_songs(folder_path)` — walks up to 3 levels deep, filters audio files with `is_main_audio` (excludes osu! hitsounds by name), reads ID3 tags for MP3s, falls back to folder-name parsing (`"<id> Artist - Title"` format), extracts background image from the `[Events]` section of `.osu` files, filters tracks outside the 30–600 second range.
- `parse_osu_bpm(osu_file_path)` — reads BPM from the `[TimingPoints]` section of a `.osu` file. Currently unused by the frontend.
- `read_audio_file(path)` — returns raw bytes; currently unused (Howler uses the asset protocol instead).

### Key constraints

- The window is **frameless and transparent** (`decorations: false, transparent: true` in `tauri.conf.json`). The custom titlebar in `App.tsx` handles dragging via `data-tauri-drag-region`. Window close calls `window.__TAURI__.window.appWindow.close()` directly.
- Asset protocol scope in `tauri.conf.json` covers `S:\**`, `C:\**`, and `$HOME\**` — this is a Windows-first app (osu! default install path is `C:\osu!\Songs`).
- The `@` alias in `vite.config.ts` resolves to `./src`, used throughout imports.
- Vite dev server is locked to port **1420** (Tauri's configured `devUrl`).
