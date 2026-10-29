import { useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { convertFileSrc } from '@tauri-apps/api/core';
import { usePlayerStore, predictNextTrack } from '@/stores/playerStore';

// Laisse la piste courante finir de démarrer avant d'ouvrir la suivante, pour
// que les deux lectures disque ne se concurrencent pas.
const PRELOAD_DELAY_MS = 1000;

/**
 * Piste suivante déjà ouverte et décodée : « suivant » et l'enchaînement en
 * fin de morceau démarrent sans attendre le disque — et, sous Windows,
 * l'analyse antivirus à l'ouverture du fichier.
 */
let preloaded: { trackId: string; howl: Howl } | null = null;

function preloadNextTrack() {
  const next = predictNextTrack(usePlayerStore.getState());
  if (!next || preloaded?.trackId === next.id) return;
  preloaded?.howl.unload();
  const howl = new Howl({
    src: [convertFileSrc(next.path)],
    html5: true,
    preload: true,
    // Une piste illisible ne doit pas être adoptée : elle resterait muette.
    onloaderror: () => { if (preloaded?.howl === howl) preloaded = null; howl.unload(); },
  });
  preloaded = { trackId: next.id, howl };
}

function takePreloaded(trackId: string): Howl | null {
  if (preloaded?.trackId !== trackId) return null;
  const { howl } = preloaded;
  preloaded = null;
  return howl;
}

export function useAudio() {
  const howlRef = useRef<Howl | null>(null);
  const progressRef = useRef<number>(0);
  const { currentTrack, volume, isMuted, setStatus, setPlayback, nextTrack } = usePlayerStore();

  const cleanup = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!currentTrack) return;
    cleanup();
    setStatus('loading');

    const src = convertFileSrc(currentTrack.path);

    const adopted = takePreloaded(currentTrack.id);
    const howl = adopted ?? new Howl({
      src: [src],
      html5: true,
      volume: isMuted ? 0 : volume,
      onend: () => nextTrack(),
      onloaderror: (_id: number, _err: unknown) => setStatus('error'),
      onplay: () => setStatus('playing'),
      onpause: () => setStatus('paused'),
    });
    if (adopted) {
      adopted.volume(isMuted ? 0 : volume);
      adopted.on('end', () => nextTrack());
      adopted.on('loaderror', () => setStatus('error'));
      adopted.on('play', () => setStatus('playing'));
      adopted.on('pause', () => setStatus('paused'));
    }

    let preloadTimer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      setStatus('playing');
      howl.play();
      preloadTimer = setTimeout(preloadNextTrack, PRELOAD_DELAY_MS);
    };
    // Une piste préchargée peut être prête avant même d'être adoptée.
    if (howl.state() === 'loaded') start(); else howl.once('load', start);

    howlRef.current = howl;

    const tick = setInterval(() => {
      if (howl.playing()) {
        const seek = howl.seek() as number;
        const dur = howl.duration() || 1;
        const p = seek / dur;
        if (Math.abs(p - progressRef.current) > 0.001) {
          progressRef.current = p;
          setPlayback(p, seek);
        }
      }
    }, 500);

    return () => { clearInterval(tick); clearTimeout(preloadTimer); cleanup(); };
  }, [currentTrack]);

  useEffect(() => {
    if (!howlRef.current) return;
    howlRef.current.volume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  const play = useCallback(() => howlRef.current?.play(), []);
  const pause = useCallback(() => howlRef.current?.pause(), []);
  const seek = useCallback((ratio: number) => {
    if (!howlRef.current) return;
    const dur = howlRef.current.duration() || 0;
    howlRef.current.seek(ratio * dur);
    setPlayback(ratio, ratio * dur);
  }, []);
  const toggle = useCallback(() => {
    if (!howlRef.current) return;
    if (howlRef.current.playing()) pause(); else play();
  }, [play, pause]);

  return { play, pause, toggle, seek };
}