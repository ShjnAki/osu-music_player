# 🎵 osu! Player

A lightweight, themeable desktop music player for your osu! beatmap collection.

Built with **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Features

- 🎵 Plays MP3 and OGG files from your osu! Songs folder
- 📋 Library with search (title / artist) and BPM range filter
- ❤️ Favorites and manual playlists
- 🎨 4 built-in themes (Dark, Glass, Sakura, Minimal)
- 🔀 Shuffle & repeat modes
- 🔊 Volume control
- 🏷️ ID3 tag reading (title, artist) with folder-name fallback
- 🖼️ Album art and beatmap background images
- 🔵 Sphere mode — circular always-on-top window with track list inside
- ⚡ Metadata cache: first scan is slow, subsequent launches load instantly
- 💾 Settings persisted between sessions
- 🪟 Frameless, draggable window

## Prerequisites

- [Node.js 18+](https://nodejs.org/) LTS
- [Rust stable](https://rustup.rs/)
- [Tauri v2 prerequisites for Windows](https://v2.tauri.app/start/prerequisites/)
  - Microsoft C++ Build Tools: `winget install Microsoft.VisualStudio.2022.BuildTools`
  - WebView2 (included in Windows 11, installer available for Windows 10)

## Getting started

```bash
npm install

# Development (hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

## Project structure

```
osu-player/
├── src/                        # React frontend
│   ├── components/
│   │   ├── Library/            # Track list, search, favorites, playlists, BPM filter
│   │   ├── Player/             # PlayerBar — controls, progress, cover art
│   │   ├── Settings/           # Theme selector, folder picker
│   │   └── SphereView/         # Circular mode layout
│   ├── hooks/
│   │   ├── useAudio.ts         # Howler.js playback engine
│   │   └── useTheme.ts         # CSS variable theming + 4 built-in themes
│   ├── stores/
│   │   └── playerStore.ts      # Zustand global state (persist: folder, volume, theme, favorites, playlists)
│   ├── types/index.ts
│   └── styles/globals.css
└── src-tauri/                  # Rust backend
    └── src/lib.rs              # scan_osu_songs, load_tracks_cache, save_tracks_cache, set_sphere_mode
```

## Sphere mode

Click **◎** in the titlebar to switch to sphere mode: a circular 360×360 window that floats always-on-top. The beatmap background fills the sphere. Click **⊡** to return to normal mode.

## Themes

Themes are defined in `src/hooks/useTheme.ts` as objects with CSS custom properties. To add a theme, append an entry to the `BUILTIN_THEMES` array with the required `ThemeVariables` keys (see `src/types/index.ts`).

## License

MIT — Fork it, mod it, share it! 🎮
