// src/lib/audioAnalysis.ts

/**
 * Analyse du son pour le visualiseur, par Web Audio.
 *
 * Brancher un <audio> sur Web Audio est définitif : sa sortie passe dès lors
 * par le contexte audio, et se tait si celui-ci est suspendu. On ne branche
 * donc qu'un contexte qui tourne, et seulement les pistes qui en ont besoin.
 */

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let gain: GainNode | null = null;
let routed: HTMLAudioElement | null = null;

// Le temps qu'un contexte tout juste créé démarre, sans retarder la lecture.
const START_TIMEOUT_MS = 1000;

/**
 * Crée et démarre le contexte audio. À appeler pendant un geste de
 * l'utilisateur : en dehors, la webview peut le laisser suspendu.
 */
export function primeAudioAnalysis() {
  if (!context) {
    context = new AudioContext();
    analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    // Le volume après l'analyse : le visualiseur garde son ampleur quand on
    // baisse le son.
    gain = context.createGain();
    analyser.connect(gain);
    gain.connect(context.destination);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
}

function whenRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state === 'running') return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ctx.removeEventListener('statechange', check); resolve(false); }, START_TIMEOUT_MS);
    const check = () => {
      if (ctx.state !== 'running') return;
      clearTimeout(timer);
      ctx.removeEventListener('statechange', check);
      resolve(true);
    };
    ctx.addEventListener('statechange', check);
  });
}

/**
 * Fait passer l'élément par l'analyseur, dès que le contexte tourne. Renvoie
 * de quoi le débrancher, ou null s'il reste hors analyse : sans contexte, ou
 * contexte resté suspendu, la piste joue simplement sans visualiseur.
 *
 * L'élément doit avoir été chargé avec crossOrigin = 'anonymous' : sinon
 * l'analyseur ne reçoit que du silence, et le son aussi.
 */
export async function routeThroughAnalyser(audio: HTMLAudioElement): Promise<(() => void) | null> {
  const ctx = context;
  if (!ctx || !analyser || !(await whenRunning(ctx))) return null;
  let source: MediaElementAudioSourceNode;
  try {
    source = ctx.createMediaElementSource(audio);
  } catch {
    return null;
  }
  source.connect(analyser);
  // WebKitGTK n'applique plus le volume de l'élément une fois branché, et
  // Chromium l'appliquerait en plus du gain : il passe tout entier au gain.
  if (gain) gain.gain.value = audio.volume;
  audio.volume = 1;
  routed = audio;
  return () => {
    source.disconnect();
    if (routed === audio) routed = null;
  };
}

/**
 * Règle le volume de l'élément, où qu'il soit appliqué : sur l'élément lui-même,
 * ou sur le gain s'il passe par l'analyseur.
 */
export function setPlaybackVolume(audio: HTMLAudioElement, volume: number) {
  if (audio === routed && gain) gain.gain.value = volume;
  else audio.volume = volume;
}

/** L'analyseur, s'il reçoit la piste en cours. */
export function getAnalyser(): AnalyserNode | null {
  return routed ? analyser : null;
}
