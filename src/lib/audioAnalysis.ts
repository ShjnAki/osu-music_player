// src/lib/audioAnalysis.ts

/**
 * Analyse du son pour le visualiseur, par Web Audio.
 *
 * Le son qu'on entend ne passe jamais par Web Audio : brancher un <audio> sur
 * un contexte est définitif, et sa sortie ne dépend plus alors que de celle du
 * contexte. Chez un utilisateur (WebKitGTK sous Debian), elle restait muette
 * alors que l'analyse fonctionnait. L'analyseur reçoit donc une copie de la
 * piste, calée sur l'élément audible et que rien ne relie aux haut-parleurs :
 * si Web Audio fait défaut, le visualiseur s'arrête, pas la musique.
 */

let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let analysed: HTMLAudioElement | null = null;

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
    // Sa sortie n'est reliée à rien : un analyseur est alimenté quand même,
    // et la copie qu'il reçoit reste inaudible.
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
 * Fait analyser la piste que joue `audio`, chargée depuis `url`, dès que le
 * contexte tourne. Renvoie de quoi arrêter l'analyse, ou null sans contexte
 * démarré : la piste joue alors simplement sans visualiseur.
 */
export async function analysePlayback(audio: HTMLAudioElement, url: string): Promise<(() => void) | null> {
  const ctx = context;
  if (!ctx || !analyser || !(await whenRunning(ctx))) return null;

  const copy = new Audio();
  copy.preload = 'auto';
  // Avant src : une source chargée sans CORS ne livre à Web Audio que du silence.
  copy.crossOrigin = 'anonymous';
  let source: MediaElementAudioSourceNode;
  try {
    // Branchée avant même d'être chargée : elle ne doit jamais sortir sur les
    // haut-parleurs, en plus de l'élément audible.
    source = ctx.createMediaElementSource(copy);
  } catch {
    return null;
  }
  source.connect(analyser);
  copy.src = url;

  // Recalée quand la piste démarre, reprend ou saute, puis une seconde fois
  // dès que sa position avance pour de bon : une piste qui démarre reste un
  // moment immobile (près d'une seconde sous WebKitGTK), pendant que la copie,
  // prête plus tôt, filerait devant. On ne peut pas, en revanche, comparer les
  // positions en continu : après un saut, WebKitGTK annonce celle d'un élément
  // branché sur Web Audio environ une seconde en avance, et la copie serait
  // recalée sans fin.
  let alignedAt: number | null = null;
  const align = () => { copy.currentTime = audio.currentTime; };
  const realign = () => {
    align();
    alignedAt = audio.currentTime;
  };
  const settle = () => {
    if (alignedAt === null || audio.currentTime === alignedAt) return;
    alignedAt = null;
    align();
  };
  const follow = () => {
    if (audio.paused) {
      if (!copy.paused) copy.pause();
      return;
    }
    if (!copy.paused) return;
    realign();
    // Un refus ne prive que le visualiseur.
    copy.play().catch(() => {});
  };
  audio.addEventListener('play', follow);
  audio.addEventListener('pause', follow);
  audio.addEventListener('seeking', realign);
  audio.addEventListener('timeupdate', settle);
  follow();
  analysed = copy;

  return () => {
    audio.removeEventListener('play', follow);
    audio.removeEventListener('pause', follow);
    audio.removeEventListener('seeking', realign);
    audio.removeEventListener('timeupdate', settle);
    source.disconnect();
    copy.pause();
    // Sans ça, la copie garde le fichier ouvert jusqu'au ramasse-miettes.
    copy.removeAttribute('src');
    copy.load();
    if (analysed === copy) analysed = null;
  };
}

/** L'analyseur, s'il reçoit la piste en cours. */
export function getAnalyser(): AnalyserNode | null {
  return analysed ? analyser : null;
}
