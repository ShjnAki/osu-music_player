// src/components/BeatmapVideo/BeatmapVideo.tsx
import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { openLocalMedia } from '@/lib/localMedia';
import type { Track } from '@/types';

// La position audio n'arrive que toutes les 500 ms et la vidéo avance d'elle-même
// entre deux ticks : ne recaler qu'au-delà de cet écart évite de saccader la
// lecture par des sauts incessants.
const DRIFT_TOLERANCE_SECS = 0.2;

type TrackWithVideo = Track & { videoPath: string };

export function hasVideo(track: Track | null): track is TrackWithVideo {
  return !!track?.videoPath;
}

interface Props {
  track: TrackWithVideo;
  className: string;
  onUnavailable: () => void;
}

/**
 * Vidéo de la beatmap, muette, calée sur la musique : c'est useAudio qui joue le
 * son, la vidéo ne fait que suivre sa position.
 */
export function BeatmapVideo({ track, className, onUnavailable }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const status = usePlayerStore((s) => s.status);
  const audioTime = usePlayerStore((s) => s.audioTime);
  const offsetSecs = (track.videoOffsetMs ?? 0) / 1000;
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    openLocalMedia(track.videoPath).then((media) => {
      if (cancelled) { media.release(); return; }
      release = media.release;
      setSrc(media.url);
    }, () => { if (!cancelled) onUnavailable(); });
    return () => { cancelled = true; release?.(); };
  }, [track.videoPath]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const target = audioTime - offsetSecs;

    // Vidéo pas encore commencée ou déjà finie : elle reste sur sa première
    // ou sa dernière image, comme dans osu!.
    if (target < 0 || (video.duration && target >= video.duration)) {
      if (!video.paused) video.pause();
      const still = target < 0 ? 0 : video.duration;
      if (video.currentTime !== still) video.currentTime = still;
      return;
    }
    if (Math.abs(video.currentTime - target) > DRIFT_TOLERANCE_SECS) {
      video.currentTime = target;
    }
    if (status === 'playing' && video.paused) {
      // Le refus de lecture ne concerne qu'une vidéo muette ici : sans gravité.
      video.play().catch(() => {});
    } else if (status !== 'playing' && !video.paused) {
      video.pause();
    }
  }, [audioTime, status, offsetSecs, src]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={src ?? undefined}
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      onError={onUnavailable}
    />
  );
}
