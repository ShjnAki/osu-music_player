import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore, predictNextTrack } from '@/stores/playerStore';
import { openLocalMedia } from '@/lib/localMedia';

// Laisse la piste courante finir de démarrer avant d'ouvrir la suivante, pour
// que les deux lectures disque ne se concurrencent pas.
const PRELOAD_DELAY_MS = 1000;

// Un <audio> natif plutôt que Howler : en mode html5, Howler fige la durée au
// premier « prêt » et programme la fin de piste par minuterie. Or WebKitGTK
// annonce d'abord une durée nulle pour un blob : Howler concluait la piste
// finie dès le départ et passait à la suivante. L'évènement `ended` du
// navigateur ne dépend pas de cette estimation.
interface OpenTrack {
  audio: HTMLAudioElement;
  release: () => void;
}

async function openTrack(path: string): Promise<OpenTrack> {
  const media = await openLocalMedia(path);
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = media.url;
  return {
    audio,
    release: () => {
      audio.pause();
      // Sans ça, l'élément garde le fichier ouvert jusqu'au ramasse-miettes.
      audio.removeAttribute('src');
      audio.load();
      media.release();
    },
  };
}

/** Assez de données pour démarrer sans coupure (HAVE_FUTURE_DATA). */
const isPlayable = (audio: HTMLAudioElement) => audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;

/**
 * Piste suivante déjà ouverte et décodée : « suivant » et l'enchaînement en
 * fin de morceau démarrent sans attendre le disque — et, sous Windows,
 * l'analyse antivirus à l'ouverture du fichier.
 */
let preloaded: { trackId: string; track: Promise<OpenTrack> } | null = null;

function preloadNextTrack() {
  const next = predictNextTrack(usePlayerStore.getState());
  if (!next || preloaded?.trackId === next.id) return;
  preloaded?.track.then((t) => t.release(), () => {});
  const entry = { trackId: next.id, track: openTrack(next.path) };
  preloaded = entry;
  // Une piste illisible ne doit pas être adoptée : elle resterait muette. Si
  // elle l'est déjà, c'est l'effet de lecture qui gère l'erreur.
  const discard = () => { if (preloaded === entry) preloaded = null; };
  entry.track.then((t) => t.audio.addEventListener('error', () => {
    if (preloaded !== entry) return;
    discard();
    t.release();
  }, { once: true }), discard);
}

function takePreloaded(trackId: string): Promise<OpenTrack> | null {
  if (preloaded?.trackId !== trackId) return null;
  const { track } = preloaded;
  preloaded = null;
  return track;
}

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const progressRef = useRef<number>(0);
  const { currentTrack, volume, isMuted, setStatus, setPlayback, nextTrack } = usePlayerStore();

  const cleanup = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
    audioRef.current = null;
  }, []);

  useEffect(() => {
    if (!currentTrack) return;
    cleanup();
    setStatus('loading');

    // L'ouverture est asynchrone (blob sous Linux) : une piste changée entre-temps
    // ne doit ni jouer ni rester en mémoire.
    let cancelled = false;
    // Détachés avant la libération : la pause qu'elle provoque ne doit pas
    // repasser la nouvelle piste, en chargement, à l'état « en pause ».
    let listeners = new AbortController();
    let tick: ReturnType<typeof setInterval> | undefined;
    let preloadTimer: ReturnType<typeof setTimeout> | undefined;

    const path = currentTrack.path;
    const adopt = (track: OpenTrack, retriesLeft: number) => {
      if (cancelled) { track.release(); return; }
      const { audio } = track;
      audioRef.current = audio;
      releaseRef.current = track.release;

      const { isMuted: muted, volume: vol } = usePlayerStore.getState();
      audio.volume = muted ? 0 : vol;
      // WebKitGTK refuse parfois un blob audio avant même de l'ouvrir
      // (code 4, readyState 0), puis le relit sans souci : on rouvre une fois
      // avec un blob et un élément neufs plutôt que de laisser la piste muette.
      const onError = () => {
        if (retriesLeft > 0 && audio.readyState === HTMLMediaElement.HAVE_NOTHING) {
          listeners.abort();
          clearInterval(tick);
          clearTimeout(preloadTimer);
          cleanup();
          listeners = new AbortController();
          openTrack(path).then((fresh) => adopt(fresh, retriesLeft - 1), () => { if (!cancelled) setStatus('error'); });
        } else {
          setStatus('error');
        }
      };
      audio.addEventListener('ended', () => nextTrack(), { signal: listeners.signal });
      audio.addEventListener('error', onError, { signal: listeners.signal });
      audio.addEventListener('play', () => setStatus('playing'), { signal: listeners.signal });
      audio.addEventListener('pause', () => { if (!audio.ended) setStatus('paused'); }, { signal: listeners.signal });
      // Une piste préchargée en erreur avant d'être adoptée.
      if (audio.error) { onError(); return; }

      const start = () => {
        // Rejet attendu si la piste est quittée avant de démarrer (AbortError) ;
        // les vraies erreurs de lecture arrivent par l'évènement `error`.
        audio.play().catch(() => {});
        preloadTimer = setTimeout(preloadNextTrack, PRELOAD_DELAY_MS);
      };
      // Une piste préchargée peut être prête avant même d'être adoptée.
      if (isPlayable(audio)) start(); else audio.addEventListener('canplay', start, { once: true, signal: listeners.signal });

      tick = setInterval(() => {
        if (!audio.paused && audio.duration > 0) {
          const seek = audio.currentTime;
          const p = seek / audio.duration;
          if (Math.abs(p - progressRef.current) > 0.001) {
            progressRef.current = p;
            setPlayback(p, seek);
          }
        }
      }, 500);
    };

    (takePreloaded(currentTrack.id) ?? openTrack(path)).then(
      (track) => adopt(track, 1),
      () => { if (!cancelled) setStatus('error'); },
    );

    return () => { cancelled = true; listeners.abort(); clearInterval(tick); clearTimeout(preloadTimer); cleanup(); };
  }, [currentTrack]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = isMuted ? 0 : volume;
  }, [volume, isMuted]);

  const play = useCallback(() => { audioRef.current?.play().catch(() => {}); }, []);
  const pause = useCallback(() => audioRef.current?.pause(), []);
  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !(audio.duration > 0)) return;
    audio.currentTime = ratio * audio.duration;
    setPlayback(ratio, ratio * audio.duration);
  }, []);
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(); else pause();
  }, [play, pause]);

  return { play, pause, toggle, seek };
}