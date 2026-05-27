import { useMemo } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { Track } from '@/types';
import './SphereView.css';

interface Props {
  onToggle: () => void;
  onSeek: (ratio: number) => void;
}

export function SphereView({ onToggle, onSeek }: Props) {
  const {
    tracks, searchQuery, currentTrack, status, progress,
    isShuffled, repeatMode, setCurrentTrack, nextTrack, prevTrack,
    cycleRepeat, toggleShuffle,
  } = usePlayerStore();

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return q ? tracks.filter(t =>
      t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    ) : tracks;
  }, [tracks, searchQuery]);

  const isPlaying = status === 'playing';
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;
  const bgUrl = bgRaw ? convertFileSrc(bgRaw) : null;

  const formatTime = (secs?: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const elapsed = currentTrack?.duration ? progress * currentTrack.duration : 0;

  return (
    <div className="sphere-view" data-tauri-drag-region>
      {bgUrl && (
        <div className="sphere-bg" style={{ backgroundImage: `url("${bgUrl}")` }} />
      )}
      <div className="sphere-bg-overlay" />

      {/* Track list */}
      <div className="sphere-list" data-tauri-drag-region="false">
        {filtered.map((track: Track) => (
          <div
            key={track.id}
            className={`sphere-track ${currentTrack?.id === track.id ? 'active' : ''}`}
            onClick={() => setCurrentTrack(track)}
          >
            <span className="sphere-track-indicator">
              {currentTrack?.id === track.id ? '▶' : ''}
            </span>
            <div className="sphere-track-info">
              <div className="sphere-track-title">{track.title}</div>
              <div className="sphere-track-artist">{track.artist}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Current track overlay */}
      <div className="sphere-now-playing">
        <div className="sphere-title">{currentTrack?.title ?? '—'}</div>
        <div className="sphere-artist">{currentTrack?.artist ?? ''}</div>
      </div>

      {/* Progress bar */}
      <div className="sphere-progress">
        <span className="sphere-time">{formatTime(elapsed)}</span>
        <input
          type="range" min={0} max={1} step={0.001} value={progress}
          onChange={(e) => onSeek(+e.target.value)}
          className="sphere-seek"
          data-tauri-drag-region="false"
        />
        <span className="sphere-time">{formatTime(currentTrack?.duration)}</span>
      </div>

      {/* Controls */}
      <div className="sphere-controls">
        <button className={`sphere-btn sm ${isShuffled ? 'active' : ''}`} onClick={toggleShuffle}>⇄</button>
        <button className="sphere-btn" onClick={prevTrack}>⏮</button>
        <button className="sphere-btn play" onClick={onToggle}>
          {status === 'loading'
            ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            : isPlaying ? '⏸' : '▶'}
        </button>
        <button className="sphere-btn" onClick={nextTrack}>⏭</button>
        <button className={`sphere-btn sm ${repeatMode !== 'none' ? 'active' : ''}`} onClick={cycleRepeat}>
          {repeatMode === 'one' ? '🔂' : '🔁'}
        </button>
      </div>
    </div>
  );
}
