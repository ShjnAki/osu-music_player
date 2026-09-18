# Changelog

## [0.2.0] - 2026-09-18

### Added
- **Linux support**: the release workflow now builds on `ubuntu-22.04` alongside Windows, producing `.deb`, `.rpm` and `.AppImage` artifacts. Asset protocol scopes are split into `tauri.windows.conf.json` and `tauri.linux.conf.json` — the previous `C:\**` and `$HOME\**` patterns are rejected outright by the glob engine on Linux (a backslash is not a path separator there, so `**` does not form its own component), which crashed the app at startup before any window appeared.
- **Songs folder auto-detection**: `default_songs_folder` returns the first osu! library that actually exists — `C:\osu!\Songs`, `%LOCALAPPDATA%`, and every drive letter on Windows; Wine prefixes and every `/mnt` mount point on Linux. `songsFolder` now starts empty instead of hardcoding `C:\osu!\Songs`, and the folder picker opens when nothing is found.
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
- **Build broken by invalid Tauri permissions**: `capabilities/default.json` declared `fs:allow-create-dir` and `path:allow-app-local-data-dir`, neither of which exists in Tauri 2.10 (the first is now `fs:allow-mkdir`; the `path` plugin moved under `core:`, and `core:default` already grants `resolve-directory` for `appLocalDataDir()`). The build script rejects unknown permissions, so this failed before compiling any code — the release workflow would have failed on its first run.
- **BPM never populated**: `scan_osu_songs` hardcoded `bpm: None`, so the BPM filter, the Library badge and the PlayerBar readout could never appear. `parse_osu_bpm` was removed earlier in this release as dead code, but it was the only thing that filled the field — and it was broken anyway, scanning every comma-bearing line instead of `[TimingPoints]`, so a break period like `2,100,300` parsed as 30000 BPM. Parsing now lives in a dependency-free `osu_parse` module with unit tests: it reads only the section, skips inherited (negative beat length) points, and reports the BPM of the longest-running segment — what osu! itself displays. The `.osu` file is read once for both background and BPM instead of twice.
- **Cache path built by string concatenation**: `getCachePath` appended the filename to `appLocalDataDir()` assuming a trailing separator. That holds on Windows but not on Linux, where the cache landed next to the app data directory as `com.osu-player.apptracks-cache.json`. Now built with `join()`.
- **Stale caches kept serving BPM-less tracks**: `TracksCache` gains a `version` field. Without it, a cache whose folder mtime never changes would be reused indefinitely, so existing users would never see BPM data. One forced rescan on first launch after updating.
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
