import { useMemo, useState, type MouseEvent } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import { BeatmapVideo, hasVideo } from '@/components/BeatmapVideo/BeatmapVideo';
import type { Track } from '@/types';
import './SphereView.css';

// Doit égaler la hauteur rendue de .sphere-track : la virtualisation calcule
// les positions sans mesurer le DOM.
const SPHERE_TRACK_HEIGHT = 36;

// Ce qui garde son clic ; tout le reste de la sphère sert de poignée.
const INTERACTIVE = 'button, input, .sphere-track';

/**
 * Déplace la fenêtre depuis n'importe quel point libre de la sphère.
 * L'attribut data-tauri-drag-region ne réagit qu'à l'élément cliqué
 * lui-même : posé sur la sphère, toujours recouverte par le fond et le voile,
 * il ne servait jamais — et un double-clic y aurait agrandi la fenêtre.
 */
function startWindowDrag(e: MouseEvent) {
  if (e.button !== 0 || (e.target as Element).closest(INTERACTIVE)) return;
  e.preventDefault();
  getCurrentWindow().startDragging().catch(() => {});
}

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

  const { containerRef, start, end, totalHeight, offsetTop } =
    useVirtualRows<HTMLDivElement>(filtered.length, SPHERE_TRACK_HEIGHT);

  const isPlaying = status === 'playing';
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;
  const bgUrl = bgRaw ? convertFileSrc(bgRaw) : null;

  // Codec non pris en charge par la webview : on retombe sur l'image de fond.
  const [failedVideo, setFailedVideo] = useState<string | null>(null);
  const videoTrack = hasVideo(currentTrack) && currentTrack.videoPath !== failedVideo
    ? currentTrack
    : null;

  const formatTime = (secs?: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const elapsed = currentTrack?.duration ? progress * currentTrack.duration : 0;

  return (
    <div className={`sphere-view ${videoTrack ? 'has-video' : ''}`} onMouseDown={startWindowDrag}>
      {videoTrack ? (
        <BeatmapVideo
          key={videoTrack.id}
          track={videoTrack}
          className="sphere-video"
          onUnavailable={() => setFailedVideo(videoTrack.videoPath)}
        />
      ) : bgUrl && (
        <div className="sphere-bg" style={{ backgroundImage: `url("${bgUrl}")` }} />
      )}
      <div className="sphere-bg-overlay" />

      {/* Track list */}
      <div className="sphere-list" ref={containerRef}>
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetTop}px)` }}>
            {filtered.slice(start, end).map((track: Track) => (
              <div
                key={track.id}
                className={`sphere-track ${currentTrack?.id === track.id ? 'active' : ''}`}
                style={{ height: SPHERE_TRACK_HEIGHT }}
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
        </div>
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
