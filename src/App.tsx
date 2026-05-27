import { useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useAudio } from '@/hooks/useAudio';
import { usePlayerStore } from '@/stores/playerStore';
import { invoke } from '@tauri-apps/api/core';
import { PlayerBar } from '@/components/Player/PlayerBar';
import { Library } from '@/components/Library/Library';
import { Settings } from '@/components/Settings/Settings';
import '@/styles/globals.css';
import './App.css';

export default function App() {
  useTheme();
  const { toggle, seek } = useAudio();
  const { songsFolder, setTracks, setIsScanning, isScanning, showSettings, showLibrary } = usePlayerStore();

  useEffect(() => { handleScan(); }, []);

  const handleScan = async () => {
    setIsScanning(true);
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
        backgroundPath: t.background_path, // ← nouveau
      })));
    } catch (e) { console.warn('Scan failed:', e); }
    finally { setIsScanning(false); }
  };

  return (
    <div className="app">
      <div className="titlebar" data-tauri-drag-region>
        <span className="titlebar-title">osu! player</span>
        <div className="titlebar-actions">
          <button className="titlebar-btn" onClick={() => {}}>—</button>
          <button className="titlebar-btn" onClick={() => (window as any).__TAURI__?.window?.appWindow?.close()}>×</button>
        </div>
      </div>
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