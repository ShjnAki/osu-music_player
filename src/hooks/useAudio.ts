import { useEffect, useRef, useCallback } from 'react';
import { Howl } from 'howler';
import { convertFileSrc } from '@tauri-apps/api/core';
import { usePlayerStore } from '@/stores/playerStore';

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

    const howl = new Howl({
      src: [src],
      html5: true,
      volume: isMuted ? 0 : volume,
      onload: () => { setStatus('playing'); howl.play(); },
      onend: () => nextTrack(),
      onloaderror: (_id: number, _err: unknown) => setStatus('error'),
      onplay: () => setStatus('playing'),
      onpause: () => setStatus('paused'),
    });

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

    return () => { clearInterval(tick); cleanup(); };
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