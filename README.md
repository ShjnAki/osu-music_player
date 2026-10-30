# 🎵 osu! Player

A lightweight, themeable desktop music player for your osu! beatmap collection.

Built with **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Download

**[⬇️ Download the latest release](https://github.com/ShjnAki/osu-music_player/releases/latest)** — no compilation needed.

- **Windows** — the `.msi`, or the `.exe` NSIS installer
- **Linux** — the `.AppImage` (portable: `chmod +x`, then run) or the `.deb`

On first launch the app looks for your osu! `Songs` folder on its own, including Wine prefixes and WSL mounts on Linux, and opens the folder picker if it can't find one.

Want to build it yourself instead? See [Getting Started](#getting-started).

## Features

- 🎵 Plays MP3 and OGG files from your osu! Songs folder
- 📋 Library with search (title / artist), BPM range filter and a filter for tracks with a video
- ❤️ Favorites and manual playlists
- 🎨 4 built-in themes (Dark, Glass, Sakura, Minimal)
- 🔀 Shuffle & repeat modes
- 🔊 Volume control
- 🏷️ ID3 tag reading (title, artist) with folder-name fallback
- 🖼️ Album art and beatmap background images
- 🎬 Beatmap videos, muted and synced to the music
- 🔵 Sphere mode — circular always-on-top window with track list inside
- ⚡ Metadata cache: first scan is slow, subsequent launches load instantly
- 💾 Settings persisted between sessions
- 🪟 Frameless, draggable window

## Screenshots

| Sphere mode | Library |
| --- | --- |
| ![Sphere mode](docs/screenshot-sphere.png) | ![Library view](docs/screenshot-library.png) |

## Prerequisites

- [Node.js 18+](https://nodejs.org/) LTS version
- [Rust (stable)](https://rustup.rs/) or `winget install Rustlang.Rustup` then `rustup default stable`
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform:
  - **Windows** — Microsoft C++ Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools`, with the C++ workload) and WebView2 (included in Windows 11, installer available for Windows 10)
  - **Linux** — `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu; see the Tauri docs for other distributions), plus `gstreamer1.0-plugins-good gstreamer1.0-libav` to play MP3s and videos

## Getting Started

For contributors, or if you'd rather compile from source than use the [prebuilt installer](#download):

```bash
# Install dependencies
npm install

# Development (hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

## Project Structure

```
osu-player/
├── src/                        # React frontend
│   ├── components/
│   │   ├── BeatmapVideo/       # Beatmap video, muted and synced to the music
│   │   ├── Library/            # Track list, search, favorites, playlists, BPM filter
│   │   ├── Player/             # PlayerBar — controls, progress, cover art
│   │   ├── Settings/           # Theme selector, folder picker
│   │   └── SphereView/         # Circular mode layout
│   ├── hooks/
│   │   ├── useAudio.ts         # Playback engine (native <audio>, preloads the next track)
│   │   ├── useTheme.ts         # CSS variable theming + 4 built-in themes
│   │   └── useVirtualRows.ts   # Renders only the visible rows of the track lists
│   ├── lib/localMedia.ts       # Media URLs: asset:// or the Linux media server
│   ├── stores/
│   │   └── playerStore.ts      # Zustand global state (persist: folder, volume, theme, favorites, playlists)
│   ├── types/index.ts          # TypeScript interfaces
│   └── styles/globals.css
└── src-tauri/                  # Rust backend
    └── src/
        ├── lib.rs              # Tauri commands: scan, cache, sphere mode, media server URL
        ├── osu_parse.rs        # .osu parsing: BPM, background, video
        └── media_server.rs     # Local HTTP media server (Linux)
```

## Sphere Mode

Click **◎** in the titlebar to switch to sphere mode: a circular 360×360 window that floats always-on-top. The beatmap background, or its video, fills the sphere. Drag the sphere from any free spot to move it. Click **⊡** to return to normal mode.

## Creating a Custom Theme

Themes are defined in `src/hooks/useTheme.ts` as objects with CSS custom properties. To add a theme, append an entry to the `BUILTIN_THEMES` array:

```ts
{
  id: "my-theme",
  name: "My Theme",
  variables: {
    "--bg-primary": "#0a0a0a",
    "--accent": "#00ff88",
    // ...see ThemeVariables in src/types/index.ts
  }
}
```

## License

MIT — Fork it, mod it, share it! 🎮
