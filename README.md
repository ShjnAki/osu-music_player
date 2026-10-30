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

- 🎵 Plays MP3 and OGG files from your osu! Songs folder, on any drive (`S:\` included) and through WSL
- 📋 Library with search (title / artist), BPM range filter and a filter for tracks with a video
- ❤️ Favorites and manual playlists: add tracks, remove them with **×**, or import your osu! collections
- 🧹 Duplicates hidden: one copy of a song found in several beatmap sets
- ⏩ Optionally start each track at its beatmap's preview point, like osu!'s song select
- 🎨 4 built-in themes (Dark, Glass, Sakura, Minimal), with controls drawn as icons that stay readable in every theme
- 🔀 Shuffle & repeat modes (all, or one track); **Previous** first goes back to the start of the track, like most players
- 🔊 Volume control
- 🏷️ ID3 tag reading (title, artist) with folder-name fallback
- 🖼️ Album art and beatmap background images
- 🎬 Beatmap videos, muted and synced to the music, shown large when you hide the library (☰)
- 🎛️ Spectrum visualizer for tracks without a video: bars in the window, a ring in the sphere. It analyses a silent copy of the track, so the sound you hear never depends on it
- ✨ While a track plays, the controls fade out when you're not using them, to show the video, the visualizer or the background image, sharp (Settings → Videos)
- 🔵 Sphere mode — circular window with track list inside
- 🎧 Optional Discord Rich Presence: what you're listening to, on your profile
- 📌 Optional always-on-top pin, in the titlebar and the sphere — see [Always on Top](#always-on-top)
- ⚡ Metadata cache: first scan is slow, subsequent launches load instantly; the next track is preloaded so it starts right away
- 💾 Settings persisted between sessions
- 🪟 Frameless window: drag it from the titlebar, resize it from its edges or the grip in the bottom-right corner

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
│   │   ├── Icons/              # SVG icons of the controls (theme color)
│   │   ├── Library/            # Track list, search, favorites, playlists, BPM and video filters
│   │   ├── PinButton/          # Always-on-top pin, and what to do where the app can't pin itself
│   │   ├── Player/             # PlayerBar — controls, progress, cover art
│   │   ├── ResizeHandles/      # Resize edges and grip of the frameless window
│   │   ├── Settings/           # Folder picker, themes, video options
│   │   ├── SphereView/         # Circular mode layout
│   │   ├── Stage/              # Large video or visualizer when the library is hidden
│   │   └── Visualizer/         # Spectrum bars and ring
│   ├── hooks/
│   │   ├── useAlwaysOnTop.ts   # Applies the pin: by the window itself, or through Windows under WSL
│   │   ├── useAudio.ts         # Playback engine (native <audio>, preloads the next track)
│   │   ├── useAutoHide.ts      # Fades the controls out after a moment without pointer activity
│   │   ├── useTheme.ts         # CSS variable theming + 4 built-in themes
│   │   └── useVirtualRows.ts   # Renders only the visible rows of the track lists
│   ├── lib/
│   │   ├── audioAnalysis.ts    # Web Audio analysis of a silent copy of the track, for the visualizer
│   │   └── localMedia.ts       # Media URLs: asset:// or the Linux media server
│   ├── stores/
│   │   └── playerStore.ts      # Zustand global state (persist: folder, volume, theme, favorites, playlists, options)
│   ├── types/index.ts          # TypeScript interfaces
│   └── styles/globals.css
└── src-tauri/                  # Rust backend
    └── src/
        ├── lib.rs              # Tauri commands: scan, cache, sphere mode, media server URL, always on top
        ├── osu_parse.rs        # .osu parsing: BPM, background, video
        ├── media_server.rs     # Local HTTP media server (Linux)
        └── wsl_pin.rs          # Always on top under WSL, asked of Windows through PowerShell
```

## Sphere Mode

Click **◎** in the titlebar to switch to sphere mode: a circular 360×360 window. The pin in its top-left corner, like the one in the titlebar, keeps the window above the others. The beatmap background, or its video, fills the sphere. Drag the sphere from any free spot to move it. While a track plays, the list and controls fade out after a moment without moving the pointer, to show the video, the visualizer or the background image, sharp; they come back as soon as the pointer moves (Settings → Videos turns this off). Click **⊡** to return to normal mode.

## Always on Top

Click the pin in the titlebar, or in the sphere's top-left corner, to keep the window above the others; click it again to release it. The choice is remembered and applies to both modes. Off by default.

- **Windows, macOS, Linux on X11** — the window pins itself.
- **WSL** — the window is displayed by Windows (WSLg), so the app asks Windows to pin it, through `powershell.exe`. The first time takes a second or two. If Windows refuses, the pin turns off and its message says why.
- **Wayland, outside WSL** — an app can't keep itself on top there. Ask your desktop instead: on GNOME, press **Alt+Space** and pick **Always on Top**.

## Settings

Open them with **⚙** in the player bar.

- **Songs folder** — pick your osu! `Songs` folder and scan it. The scan is cached, and redone only when the folder's content changes. *Hide duplicates* and *Start at the preview point* are here too.
- **Themes** — Dark, Glass, Sakura, Minimal.
- **Videos** — *Hide controls while playing*: in the sphere and the player bar, the controls fade out after a moment without moving the pointer, and come back as soon as it moves. *Visualizer for tracks without a video*: turn it off to see the background image instead.

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

## Credits

Created and maintained by **Shin Aki** — original project: [github.com/ShjnAki/osu-music_player](https://github.com/ShjnAki/osu-music_player).

If you use, fork or share this app, please credit the original project with a link back to this repository. And if you like it, a ⭐ on the repo is the best way to say thanks!

## License

MIT — Fork it, mod it, share it! 🎮 See [LICENSE](LICENSE): keep its copyright notice in your copies and forks.
