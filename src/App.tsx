import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { usePlayerStore } from '@/stores/playerStore';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PlayerBar } from '@/components/Player/PlayerBar';
import { Library } from '@/components/Library/Library';
import { Settings } from '@/components/Settings/Settings';
import '@/styles/globals.css';
import './App.css';

export default function App() {
  useTheme();
  const { toggle, seek } = useAudio();
  const { songsFolder, setTracks, setIsScanning, isScanning, showSettings, showLibrary } = usePlayerStore();
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => { handleScan(); }, []);

  const handleScan = async () => {
    setIsScanning(true);
    setScanError(null);
    try {
      const raw = await invoke<any[]>('scan_osu_songs', { folderPath: songsFolder });
      setTracks(raw.map(t => ({
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
      })));
    } catch (e) {
      setScanError(String(e));
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar-title">osu! player</span>
        <div className="titlebar-actions">
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
          <Settings onScan={handleScan} isScanning={isScanning} />
        ) : (
          <>
            {showLibrary && <Library />}
            <PlayerBar onToggle={toggle} onSeek={seek} />
          </>
        )}
      </div>
    </div>
  );
}