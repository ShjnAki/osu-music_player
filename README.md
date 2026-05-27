# 🎵 osu! Player

A lightweight, themeable desktop music player for your osu! beatmap collection.

Built with **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Features

- 🎵 Plays MP3 and OGG files from your osu! Songs folder
- 📋 Library with search (title / artist)
- 🎨 4 built-in themes (Dark, Glass, Sakura, Minimal) — more coming
- 🔀 Shuffle & repeat modes
- 🔊 Volume control
- 🏷️ ID3 tag reading (title, artist, BPM)
- 🖼️ Album art from beatmap folder
- 💾 Settings persisted between sessions
- 🪟 Frameless, draggable window

## Prerequisites

- [Node.js 18+](https://nodejs.org/) LTS version
- [Rust (stable)](https://rustup.rs/) or `winget install Rustlang.Rustup` then `rustup default stable`
- [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/)
  - Microsoft C++ Build Tools `winget install Microsoft.VisualStudio.2022.BuildTools`
  - WebView2

## Getting Started

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
├── src/                      # React frontend
│   ├── components/
│   │   ├── Player/           # PlayerBar (controls, progress)
│   │   ├── Library/          # Track list + search
│   │   └── Settings/         # Themes, folder picker
│   ├── hooks/
│   │   ├── useAudio.ts       # Howler.js playback engine
│   │   └── useTheme.ts       # CSS variable theming
│   ├── stores/
│   │   └── playerStore.ts    # Zustand global state
│   ├── types/index.ts        # TypeScript interfaces
│   └── styles/globals.css
├── src-tauri/                # Rust backend
│   └── src/
│       └── lib.rs            # scan_osu_songs, parse_osu_bpm, read_audio_file
├── themes/                   # JSON theme files
│   ├── default.json
│   ├── glass.json
│   ├── sakura.json
│   └── minimal.json
└── tauri.conf.json
```

## Creating a Custom Theme

Copy any `themes/*.json` file and modify the CSS variables:

```json
{
  "id": "my-theme",
  "name": "My Theme",
  "author": "me",
  "variables": {
    "--bg-primary": "#0a0a0a",
    "--accent": "#00ff88",
    ...
  }
}
```

## Roadmap

- [ ] Custom theme loader from file
- [ ] Mini widget mode (always-on-top, compact)
- [ ] .osu file parser for BPM display
- [ ] Playlist / queue management
- [ ] Global hotkeys
- [ ] System tray
- [ ] Android / iOS (Tauri 2.0 mobile)
- [ ] Waveform visualizer

## License

MIT — Fork it, mod it, share it! 🎮
