import { usePlayerStore } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { BeatmapVideo, useVideoTrack } from '@/components/BeatmapVideo/BeatmapVideo';
import { useAutoHide } from '@/hooks/useAutoHide';
import './PlayerBar.css';

interface Props {
  onToggle: () => void;
  onSeek: (ratio: number) => void;
  onPrevious: () => void;
  /** Faux quand la vidéo passe déjà en grand au-dessus : la décoder deux fois coûterait pour rien. */
  showVideo: boolean;
}

export function PlayerBar({ onToggle, onSeek, onPrevious, showVideo }: Props) {
  const {
    currentTrack, status, progress, volume, isMuted,
    isShuffled, repeatMode, setVolume, toggleMute,
    toggleShuffle, cycleRepeat, nextTrack,
    showSettings, setShowSettings, showLibrary, setShowLibrary, hideControlsOverVideo,
  } = usePlayerStore();

  const isPlaying = status === 'playing';
  const formatTime = (secs?: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };
  const elapsed = currentTrack?.duration ? progress * currentTrack.duration : 0;

  // Background image — préfère background_path (depuis .osu), sinon cover_path
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;
  const bgUrl = bgRaw ? convertFileSrc(bgRaw) : null;

  const { videoTrack: playableVideo, markUnavailable } = useVideoTrack(currentTrack);
  const videoTrack = showVideo ? playableVideo : null;
  // En pause, les contrôles restent : c'est pour s'en servir qu'on s'arrête.
  const { hidden: controlsHidden, handlers: autoHide } =
    useAutoHide(!!videoTrack && hideControlsOverVideo && status === 'playing');

  return (
    <div
      className={`player-bar fade-in ${videoTrack ? 'has-video' : ''} ${controlsHidden ? 'controls-hidden' : ''}`}
      {...autoHide}
    >
      {videoTrack ? (
        <BeatmapVideo
          key={videoTrack.id}
          track={videoTrack}
          className="player-video"
          onUnavailable={markUnavailable}
        />
      ) : bgUrl && (
        <div
          className="player-bg"
          style={{ backgroundImage: `url("${bgUrl}")` }}
        />
      )}
      <div className="player-bg-overlay" />

      {/* Cover */}
      <div className="player-cover">
        {currentTrack?.coverPath ? (
          <img
            src={convertFileSrc(currentTrack.coverPath)}
            alt="cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="player-cover-placeholder"><span>♪</span></div>
        )}
        {isPlaying && (
          <div className="player-cover-eq">
            <span/><span/><span/>
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="player-info">
        <div className="player-title" title={currentTrack?.title}>
          {currentTrack?.title ?? 'No track selected'}
        </div>
        <div className="player-artist">{currentTrack?.artist ?? '—'}</div>
        {currentTrack?.bpm && (
          <div className="player-bpm">{Math.round(currentTrack.bpm)} BPM</div>
        )}
      </div>

      {/* Progress */}
      <div className="player-progress">
        <span className="player-time">{formatTime(elapsed)}</span>
        <input
          type="range" min={0} max={1} step={0.001} value={progress}
          onChange={(e) => onSeek(+e.target.value)}
          className="player-seek"
        />
        <span className="player-time">{formatTime(currentTrack?.duration)}</span>
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button className={`ctrl-btn ${isShuffled ? 'active' : ''}`} onClick={toggleShuffle} title="Shuffle">⇄</button>
        <button className="ctrl-btn" onClick={onPrevious} title="Previous">⏮</button>
        <button className={`ctrl-btn play-btn`} onClick={onToggle}>
          {status === 'loading'
            ? <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>◌</span>
            : isPlaying ? '⏸' : '▶'}
        </button>
        <button className="ctrl-btn" onClick={nextTrack} title="Next">⏭</button>
        <button className={`ctrl-btn ${repeatMode !== 'none' ? 'active' : ''}`} onClick={cycleRepeat}>
          {repeatMode === 'one' ? '🔂' : '🔁'}
        </button>
      </div>

      {/* Volume + nav */}
      <div className="player-extras">
        <div className="player-volume">
          <button className="ctrl-btn sm" onClick={toggleMute}>
            {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            type="range" min={0} max={1} step={0.01}
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(+e.target.value)}
            className="player-seek sm"
          />
        </div>
        <div className="player-nav-btns">
          <button className={`nav-btn ${showLibrary ? 'active' : ''}`} onClick={() => setShowLibrary(!showLibrary)}>☰</button>
          <button className={`nav-btn ${showSettings ? 'active' : ''}`} onClick={() => setShowSettings(!showSettings)}>⚙</button>
        </div>
      </div>
    </div>
  );
}