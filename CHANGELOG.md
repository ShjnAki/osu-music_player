# Changelog

## [Unreleased]

### Added
- **Sphere mode**: circular always-on-top window (360×360) with beatmap background, scrollable track list, playback controls, and progress bar. Toggle via ◎ in titlebar.
- **Metadata cache**: after the first scan, track data is cached in `appLocalDataDir/tracks-cache.json`. Subsequent launches skip the full scan if the Songs folder mtime is unchanged.
- **Favorites**: ♥ button per track (visible on hover). Persisted in Zustand localStorage. Favorites tab in Library.
- **Playlists**: create/delete named playlists, add tracks via + button. Playlists tab in Library. Persisted in localStorage.
- **BPM range filter**: dual-handle slider in Library (shown only when tracks have BPM data).
- **Scan error banner**: visible error message when `scan_osu_songs` fails (was silent `console.warn`).
- `--accent-subtle` CSS variable in all 4 themes for theme-aware highlight backgrounds.
- Button press micro-animation (`scale(0.92)` on `:active`) across all buttons.
- Background fade-in animation when track changes in PlayerBar.
- Window minimize button now functional (was a no-op).

### Fixed
- **ID3 duration bug**: TLEN frame stores milliseconds; code was treating it as seconds, causing tracks with a TLEN tag to be filtered out by the 30–600s range check. Now divides by 1000 before the check.
- Window close/minimize now uses the Tauri v2 API (`getCurrentWindow()`) instead of the deprecated Tauri v1 `window.__TAURI__.window.appWindow` pattern.
- Favicon was pointing to Vite's default `/vite.svg`; now uses `/app-icon.png`.
- `nav-btn.active` background color was hardcoded (`rgba(255,102,170,0.1)`); now uses `--accent-subtle` and responds to theme changes.
- Removed `S:\**` dev-machine path from `tauri.conf.json` asset protocol scope.

### Refactored
- `filteredTracks` removed from Zustand store (was derived state stored redundantly). `Library`, `SphereView`, and navigation logic now compute the filtered list locally.
- Dead Tauri commands `parse_osu_bpm` and `read_audio_file` removed (were registered but never called from the frontend).
- `:root` CSS variable defaults removed from `globals.css` — they were duplicates of the values applied at runtime by `useTheme`, and could silently diverge.
- `Zone.Identifier` Windows metadata files deleted and excluded from `.gitignore`.
