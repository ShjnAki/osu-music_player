// src/components/Visualizer/Visualizer.tsx
import { useEffect, useRef } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { getAnalyser } from '@/lib/audioAnalysis';
import './Visualizer.css';

type Variant = 'bars' | 'ring';

interface Props {
  variant: Variant;
  className: string;
}

// L'anneau est symétrique : 48 bandes donnent 96 rayons.
const BAND_COUNT: Record<Variant, number> = { bars: 40, ring: 48 };
// Retombée par image : les barres suivent la musique sans scintiller.
const DECAY = 0.86;
// Au-dessus de ~16 kHz, un mp3 ne contient presque rien : ces bandes resteraient vides.
const USED_SPECTRUM = 0.75;
// Bruit de fond de l'analyse, retiré pour que le silence soit plat.
const NOISE_FLOOR = 0.12;

/** Moyenne de chaque bande, réparties en échelle logarithmique comme l'oreille. */
function bandLevels(freq: Uint8Array, out: Float32Array) {
  const maxBin = Math.max(2, Math.floor(freq.length * USED_SPECTRUM));
  const count = out.length;
  for (let i = 0; i < count; i++) {
    const lo = Math.floor(Math.pow(maxBin, i / count));
    const hi = Math.max(lo + 1, Math.floor(Math.pow(maxBin, (i + 1) / count)));
    let sum = 0;
    for (let b = lo; b < hi; b++) sum += freq[b];
    const level = sum / (hi - lo) / 255;
    out[i] = Math.max(0, (level - NOISE_FLOOR) / (1 - NOISE_FLOOR));
  }
}

function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number, levels: Float32Array, unit: number) {
  const slot = w / levels.length;
  const barWidth = Math.max(2 * unit, slot * 0.6);
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const height = Math.max(2 * unit, level * h * 0.8);
    ctx.globalAlpha = 0.3 + 0.6 * level;
    ctx.beginPath();
    ctx.roundRect(i * slot + (slot - barWidth) / 2, h - height, barWidth, height, [barWidth / 2, barWidth / 2, 0, 0]);
    ctx.fill();
  }
}

function drawRing(ctx: CanvasRenderingContext2D, w: number, h: number, levels: Float32Array, unit: number) {
  const size = Math.min(w, h);
  const cx = w / 2;
  const cy = h / 2;
  // Entre le contenu et le bord de la sphère.
  const inner = size * 0.36;
  const reach = size * 0.11;
  const spokes = levels.length * 2;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2 * unit, ((2 * Math.PI * inner) / spokes) * 0.55);
  for (let s = 0; s < spokes; s++) {
    const level = levels[s < levels.length ? s : spokes - 1 - s];
    const angle = -Math.PI / 2 + (s / spokes) * 2 * Math.PI;
    const outer = inner + 2 * unit + level * reach;
    ctx.globalAlpha = 0.3 + 0.65 * level;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
  }
}

/**
 * Spectre de la piste en cours, à la place de la vidéo qu'elle n'a pas.
 * Barres dans la fenêtre, anneau dans la sphère.
 */
export function Visualizer({ variant, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playing = usePlayerStore((s) => s.status === 'playing');

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const levels = new Float32Array(BAND_COUNT[variant]);
    const target = new Float32Array(levels.length);
    let freq: Uint8Array<ArrayBuffer> | null = null;
    let frame = 0;
    let raf = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // La couleur vient du CSS (var(--accent)) : relue de temps en temps pour
    // suivre un changement de thème sans la lire à chaque image.
    let color = getComputedStyle(canvas).color;

    const draw = () => {
      const analyser = playing ? getAnalyser() : null;
      if (analyser) {
        if (!freq || freq.length !== analyser.frequencyBinCount) freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        bandLevels(freq, target);
      } else {
        target.fill(0);
      }
      let peak = 0;
      for (let i = 0; i < levels.length; i++) {
        levels[i] = Math.max(target[i], levels[i] * DECAY);
        peak = Math.max(peak, levels[i]);
      }
      if (++frame % 60 === 0) color = getComputedStyle(canvas).color;

      const unit = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      (variant === 'bars' ? drawBars : drawRing)(ctx, canvas.width, canvas.height, levels, unit);
      ctx.globalAlpha = 1;

      // En pause, une fois retombé, plus rien ne bouge : inutile de redessiner.
      if (!playing && peak < 0.005) return;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [variant, playing]);

  return <canvas ref={canvasRef} className={`visualizer ${className}`} aria-hidden="true" />;
}
