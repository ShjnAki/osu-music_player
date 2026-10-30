// src/components/Stage/Stage.tsx
import { usePlayerStore } from '@/stores/playerStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { BeatmapVideo, useVideoTrack } from '@/components/BeatmapVideo/BeatmapVideo';
import './Stage.css';

/**
 * Prend la place de la liste quand elle est masquée (☰) : la vidéo de la
 * beatmap en grand, ou à défaut son image de fond, plutôt qu'un vide.
 */
export function Stage() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const { videoTrack, markUnavailable } = useVideoTrack(currentTrack);
  const bgRaw = currentTrack?.backgroundPath ?? currentTrack?.coverPath ?? null;

  return (
    <div className="stage fade-in">
      {videoTrack ? (
        <BeatmapVideo
          key={videoTrack.id}
          track={videoTrack}
          className="stage-video"
          onUnavailable={markUnavailable}
        />
      ) : bgRaw && (
        <div
          key={bgRaw}
          className="stage-image"
          style={{ backgroundImage: `url("${convertFileSrc(bgRaw)}")` }}
        />
      )}
    </div>
  );
}
