// src/components/Stage/Stage.tsx
import { usePlayerStore } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { BeatmapVideo, useVideoTrack } from '@/components/BeatmapVideo/BeatmapVideo';
import { Visualizer } from '@/components/Visualizer/Visualizer';
import './Stage.css';

/**
 * Prend la place de la liste quand elle est masquée (☰) : la vidéo de la
 * beatmap en grand, ou à défaut son image de fond et le visualiseur, plutôt
 * qu'un vide.
 */
export function Stage() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const showVisualizer = usePlayerStore((s) => s.showVisualizer);
  const { videoTrack, markUnavailable } = useVideoTrack(currentTrack);
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;
  const visualizer = showVisualizer && !!currentTrack && !currentTrack.videoPath;

  return (
    <div className={`stage fade-in ${visualizer ? 'has-visualizer' : ''}`}>
      {videoTrack ? (
        <BeatmapVideo
          key={videoTrack.id}
          track={videoTrack}
          className="stage-video"
          onUnavailable={markUnavailable}
        />
      ) : (
        <>
          {bgRaw && (
            <div
              key={bgRaw}
              className="stage-image"
              style={{ backgroundImage: `url("${convertFileSrc(bgRaw)}")` }}
            />
          )}
          {visualizer && <Visualizer variant="bars" className="stage-visualizer" />}
        </>
      )}
    </div>
  );
}
