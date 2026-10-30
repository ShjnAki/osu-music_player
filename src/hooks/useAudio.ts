import { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore, predictNextTrack } from '@/stores/playerStore';
import { localMediaUrl } from '@/lib/localMedia';
import { primeAudioAnalysis, analysePlayback } from '@/lib/audioAnalysis';
import type { Track } from '@/types';

// Laisse la piste courante finir de démarrer avant d'ouvrir la suivante, pour
// que les deux lectures disque ne se concurrencent pas.
const PRELOAD_DELAY_MS = 1000;

// Passé ce point du morceau, « précédent » revient à son début au lieu de
// changer de piste, comme sur la plupart des lecteurs ; c'est le seuil que
// l'appli appliquait déjà.
const RESTART_AFTER_RATIO = 0.05;

// Un <audio> natif plutôt que Howler : en mode html5, Howler fige la durée au
// premier « prêt » et programme la fin de piste par minuterie. Si la webview
// annonce d'abord une durée nulle, comme WebKitGTK pour un blob, Howler
// conclut la piste finie dès le départ et passe à la suivante. L'évènement
// `ended` du navigateur ne dépend pas de cette estimation.
interface OpenTrack {
  audio: HTMLAudioElement;
  release: () => void;
}

/** Le visualiseur remplace la vidéo : seules les pistes qui n'en ont pas sont analysées. */
const wantsAnalysis = (track: Track) => usePlayerStore.getState().showVisualizer && !track.videoPath;

async function openTrack(track: Track): Promise<OpenTrack> {
  const audio = new Audio();
  audio.preload = 'auto';
  audio.src = await localMediaUrl(track.path);
  return {
    audio,
    release: () => {
      audio.pause();
      // Sans ça, l'élément garde le fichier ouvert jusqu'au ramasse-miettes.
      audio.removeAttribute('src');
      audio.load();
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
  const entry = { trackId: next.id, track: openTrack(next) };
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
  const { currentTrack, volume, isMuted, setStatus, setPlayback, nextTrack, prevTrack } = usePlayerStore();

  // Le contexte audio doit naître d'un geste de l'utilisateur pour démarrer :
  // le clic qui lance une piste suffit.
  useEffect(() => {
    const prime = () => { if (usePlayerStore.getState().showVisualizer) primeAudioAnalysis(); };
    document.addEventListener('pointerdown', prime, true);
    document.addEventListener('keydown', prime, true);
    return () => {
      document.removeEventListener('pointerdown', prime, true);
      document.removeEventListener('keydown', prime, true);
    };
  }, []);

  const cleanup = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
    audioRef.current = null;
  }, []);

  useEffect(() => {
    if (!currentTrack) return;
    cleanup();
    setStatus('loading');

    // L'ouverture est asynchrone (adresse du serveur média sous Linux) : une
    // piste changée entre-temps ne doit ni jouer ni rester ouverte.
    let cancelled = false;
    // Détachés avant la libération : la pause qu'elle provoque ne doit pas
    // repasser la nouvelle piste, en chargement, à l'état « en pause ».
    const listeners = new AbortController();
    const { signal } = listeners;
    let tick: ReturnType<typeof setInterval> | undefined;
    let preloadTimer: ReturnType<typeof setTimeout> | undefined;

    const adopt = (track: OpenTrack) => {
      if (cancelled) { track.release(); return; }
      const { audio } = track;
      audioRef.current = audio;
      releaseRef.current = track.release;

      if (wantsAnalysis(currentTrack)) {
        analysePlayback(audio, audio.src).then((stop) => {
          if (!stop) return;
          if (cancelled) { stop(); return; }
          releaseRef.current = () => { stop(); track.release(); };
        });
      }

      const { isMuted: muted, volume: vol } = usePlayerStore.getState();
      audio.volume = muted ? 0 : vol;
      audio.addEventListener('ended', () => {
        if (usePlayerStore.getState().repeatMode === 'one') {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        } else {
          nextTrack();
        }
      }, { signal });
      audio.addEventListener('error', () => setStatus('error'), { signal });
      audio.addEventListener('play', () => setStatus('playing'), { signal });
      audio.addEventListener('pause', () => { if (!audio.ended) setStatus('paused'); }, { signal });
      // Une piste préchargée en erreur avant d'être adoptée.
      if (audio.error) { setStatus('error'); return; }

      const start = () => {
        // Seulement au lancement de la piste : « précédent » et la répétition
        // d'une piste reviennent, eux, au vrai début.
        const preview = (currentTrack.previewTimeMs ?? 0) / 1000;
        if (usePlayerStore.getState().startAtPreview && preview > 0 && !(audio.duration <= preview)) {
          audio.currentTime = preview;
        }
        // Rejet attendu si la piste est quittée avant de démarrer (AbortError) ;
        // les vraies erreurs de lecture arrivent par l'évènement `error`.
        audio.play().catch(() => {});
        preloadTimer = setTimeout(preloadNextTrack, PRELOAD_DELAY_MS);
      };
      // Une piste préchargée peut être prête avant même d'être adoptée.
      if (isPlayable(audio)) start(); else audio.addEventListener('canplay', start, { once: true, signal });

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

    (takePreloaded(currentTrack.id) ?? openTrack(currentTrack)).then(
      adopt,
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
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.duration > 0 && audio.currentTime > audio.duration * RESTART_AFTER_RATIO) {
      audio.currentTime = 0;
      setPlayback(0, 0);
      return;
    }
    prevTrack();
  }, []);
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play(); else pause();
  }, [play, pause]);

  return { play, pause, toggle, seek, previous };
}