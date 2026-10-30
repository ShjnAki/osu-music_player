import { useMemo, type MouseEvent } from 'react';
import { usePlayerStore, visibleTracks } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import { useAutoHide } from '@/hooks/useAutoHide';
import { Visualizer } from '@/components/Visualizer/Visualizer';
import { BeatmapVideo, useVideoTrack } from '@/components/BeatmapVideo/BeatmapVideo';
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon, RepeatIcon, ShuffleIcon } from '@/components/Icons/Icons';
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
  onPrevious: () => void;
}

export function SphereView({ onToggle, onSeek, onPrevious }: Props) {
  const store = usePlayerStore();
  const {
    tracks, searchQuery, videoOnly, currentTrack, status, progress,
    isShuffled, repeatMode, setCurrentTrack, nextTrack,
    cycleRepeat, toggleShuffle, hideControlsOverVideo, showVisualizer,
  } = store;

  // La vue de la bibliothèque (onglet, recherche, filtres) : « suivant » ne
  // parcourt qu'elle, la sphère doit montrer les mêmes pistes.
  const filtered = useMemo(
    () => visibleTracks(store),
    [tracks, searchQuery, videoOnly, store.bpmFilter, store.favoriteIds, store.libraryTab, store.activePlaylistId, store.playlists],
  );

  const { containerRef, start, end, totalHeight, offsetTop } =
    useVirtualRows<HTMLDivElement>(filtered.length, SPHERE_TRACK_HEIGHT);

  const isPlaying = status === 'playing';
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;
  const bgUrl = bgRaw ? convertFileSrc(bgRaw) : null;

  const { videoTrack, markUnavailable } = useVideoTrack(currentTrack);
  const visualizer = showVisualizer && !!currentTrack && !currentTrack.videoPath;
  // Toute piste a de quoi se montrer une fois les contrôles effacés : sa vidéo,
  // son spectre, ou à défaut son image de fond, alors nette.
  const visualFocus = (!!videoTrack || visualizer || !!bgUrl) && hideControlsOverVideo;
  // En pause, les contrôles restent : c'est pour s'en servir qu'on s'arrête.
  const { hidden: controlsHidden, handlers: autoHide } = useAutoHide(visualFocus && status === 'playing');

  const formatTime = (secs?: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const elapsed = currentTrack?.duration ? progress * currentTrack.duration : 0;

  return (
    <div
      className={`sphere-view ${videoTrack ? 'has-video' : ''} ${visualizer ? 'has-visualizer' : ''} ${visualFocus ? 'visual-focus' : ''} ${controlsHidden ? 'controls-hidden' : ''}`}
      {...autoHide}
      onMouseDown={(e) => { autoHide.onMouseDown?.(); startWindowDrag(e); }}
    >
      {videoTrack ? (
        <BeatmapVideo
          key={videoTrack.id}
          track={videoTrack}
          className="sphere-video"
          onUnavailable={markUnavailable}
        />
      ) : bgUrl && (
        <div className="sphere-bg" style={{ backgroundImage: `url("${bgUrl}")` }} />
      )}
      <div className="sphere-bg-overlay" />
      {visualizer && <Visualizer variant="ring" className="sphere-visualizer" />}

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
        <button className={`sphere-btn sm ${isShuffled ? 'active' : ''}`} onClick={toggleShuffle} aria-label="Shuffle"><ShuffleIcon /></button>
        <button className="sphere-btn" onClick={onPrevious} aria-label="Previous"><PreviousIcon /></button>
        <button className="sphere-btn play" onClick={onToggle} aria-label={isPlaying ? 'Pause' : 'Play'}>
          {status === 'loading'
            ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            : isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button className="sphere-btn" onClick={nextTrack} aria-label="Next"><NextIcon /></button>
        <button className={`sphere-btn sm ${repeatMode !== 'none' ? 'active' : ''}`} onClick={cycleRepeat} aria-label="Repeat">
          <RepeatIcon one={repeatMode === 'one'} />
        </button>
      </div>
    </div>
  );
}
