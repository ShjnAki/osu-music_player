import { useEffect, useState, type MouseEvent } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { usePlayerStore } from '@/stores/playerStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { appLocalDataDir, join } from '@tauri-apps/api/path';
import type { Track } from '@/types';
import { PlayerBar } from '@/components/Player/PlayerBar';
import { Library } from '@/components/Library/Library';
import { Settings } from '@/components/Settings/Settings';
import { SphereView } from '@/components/SphereView/SphereView';
import { Stage } from '@/components/Stage/Stage';
import { ResizeHandles } from '@/components/ResizeHandles/ResizeHandles';
import { PinButton } from '@/components/PinButton/PinButton';
import { useAlwaysOnTop } from '@/hooks/useAlwaysOnTop';
import '@/styles/globals.css';
import './App.css';

/**
 * Déplace la fenêtre depuis la barre de titre, hors boutons.
 *
 * Pas de data-tauri-drag-region : sur un double-clic, Tauri agrandit la
 * fenêtre. Or elle a une taille maximale (600×800), et sous GNOME Wayland le
 * compositeur impose la taille de l'écran à une fenêtre agrandie : celle qui
 * ne peut pas la prendre est déconnectée, et l'appli se fermait. Le
 * double-clic ne fait donc plus rien.
 */
function startTitlebarDrag(e: MouseEvent) {
  if (e.button !== 0 || (e.target as Element).closest('button')) return;
  e.preventDefault();
  if (e.detail === 1) getCurrentWindow().startDragging().catch(() => {});
}

export default function App() {
  useTheme();
  const { toggle, seek, previous } = useAudio();
  const {
    songsFolder, setSongsFolder, setTracks, setIsScanning, isScanning,
    showSettings, setShowSettings, showLibrary, isSphereMode, toggleSphereMode,
  } = usePlayerStore();
  const [scanError, setScanError] = useState<string | null>(null);
  const pin = useAlwaysOnTop();

  useEffect(() => { loadOrScan(); }, []);

  // Sync Tauri window when sphere mode changes
  useEffect(() => {
    invoke('set_sphere_mode', { enabled: isSphereMode }).catch(() => {});
  }, [isSphereMode]);

  const mapRaw = (t: any): Track => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    bpm: t.bpm,
    duration: t.duration,
    path: t.path,
    beatmapSet: t.beatmap_set,
    coverPath: t.cover_path,
    backgroundPath: t.background_path,
    videoPath: t.video_path ?? undefined,
    videoOffsetMs: t.video_offset_ms ?? undefined,
    previewTimeMs: t.preview_time_ms ?? undefined,
  });

  const getCachePath = async () => join(await appLocalDataDir(), 'tracks-cache.json');

  const loadOrScan = async () => {
    // Dès le départ et sans interruption jusqu'au scan : sinon la liste vide
    // affichait « No tracks found » le temps de chercher le dossier et le cache.
    setIsScanning(true);
    let folder = songsFolder;
    if (!folder) {
      folder = await invoke<string>('default_songs_folder').catch(() => '');
      if (!folder) {
        setIsScanning(false);
        setShowSettings(true);
        return;
      }
      setSongsFolder(folder);
    }

    setScanError(null);
    try {
      const cachePath = await getCachePath();
      const cached = await invoke<any[] | null>('load_tracks_cache', {
        cachePath,
        folderPath: folder,
      });
      if (cached) {
        setTracks(cached.map(mapRaw));
        setIsScanning(false);
        return;
      }
    } catch {
      // cache miss or read error — fall through to full scan
    }
    await handleScan(folder);
  };

  const handleScan = async (folder: string) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const raw = await invoke<any[]>('scan_osu_songs', { folderPath: folder });
      const tracks = raw.map(mapRaw);
      setTracks(tracks);
      const cachePath = await getCachePath();
      invoke('save_tracks_cache', { cachePath, folderPath: folder, tracks: raw }).catch(() => {});
    } catch (e) {
      setScanError(String(e));
    } finally {
      setIsScanning(false);
    }
  };

  if (isSphereMode) {
    return (
      <div className="app sphere-mode">
        <SphereView onToggle={toggle} onSeek={seek} onPrevious={previous} />
        <PinButton pin={pin} className="sphere-pin-btn" hintPlacement="sphere" />
        <button
          className="sphere-exit-btn"
          onClick={toggleSphereMode}
          title="Exit sphere mode"
        >⊡</button>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="titlebar" onMouseDown={startTitlebarDrag}>
        <span className="titlebar-title">osu! player</span>
        <div className="titlebar-actions">
          <PinButton pin={pin} className="titlebar-btn" hintPlacement="titlebar" />
          <button className="titlebar-btn" onClick={toggleSphereMode} title="Sphere mode">◎</button>
          <button className="titlebar-btn" onClick={() => getCurrentWindow().minimize()}>—</button>
          <button className="titlebar-btn" onClick={() => getCurrentWindow().close()}>×</button>
        </div>
      </div>
      {scanError && (
        <div className="scan-error">
          <span>⚠ {scanError}</span>
          <button onClick={() => setScanError(null)}>×</button>
        </div>
      )}
      <div className="app-body">
        {showSettings ? (
          <Settings onScan={() => handleScan(songsFolder)} isScanning={isScanning} />
        ) : (
          <>
            {showLibrary ? <Library /> : <Stage />}
            <PlayerBar onToggle={toggle} onSeek={seek} onPrevious={previous} showVisual={showLibrary} />
          </>
        )}
      </div>
      <ResizeHandles />
    </div>
  );
}
