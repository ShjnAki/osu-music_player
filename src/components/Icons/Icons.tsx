// src/components/Icons/Icons.tsx
import type { ReactNode } from 'react';
import './Icons.css';

/**
 * Icônes des contrôles de lecture, en SVG plutôt qu'en caractères : sous
 * Linux, ⏮ ⏸ ⏭ 🔁 🔊 sont dessinés par la police emoji, dans ses propres
 * couleurs et sans tenir compte de celle du thème. Orange sur le rose de
 * Sakura, ils ne se voyaient plus, et 🔁 et 🔂 ne changeaient pas de couleur
 * une fois actifs. Ces tracés prennent la couleur du texte.
 */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></Icon>
);

export const PauseIcon = () => (
  <Icon>
    <rect x="7" y="6" width="3" height="12" rx="0.5" fill="currentColor" />
    <rect x="14" y="6" width="3" height="12" rx="0.5" fill="currentColor" />
  </Icon>
);

export const PreviousIcon = () => (
  <Icon><path d="M6 6v12" /><path d="M18 6.5v11L10 12z" fill="currentColor" /></Icon>
);

export const NextIcon = () => (
  <Icon><path d="M18 6v12" /><path d="M6 6.5v11L14 12z" fill="currentColor" /></Icon>
);

export const ShuffleIcon = () => (
  <Icon><path d="M4 7h3l8 10h5M4 17h3l8-10h5M17 4l3 3-3 3M17 14l3 3-3 3" /></Icon>
);

export const RepeatIcon = ({ one = false }: { one?: boolean }) => (
  <Icon>
    <path d="M17 3l3 3-3 3M4 11v-1a4 4 0 0 1 4-4h12M7 21l-3-3 3-3M20 13v1a4 4 0 0 1-4 4H4" />
    {one && <path d="M11 10.5l1.5-1v5" strokeWidth={1.8} />}
  </Icon>
);

export const VolumeIcon = ({ level }: { level: 'muted' | 'low' | 'high' }) => (
  <Icon>
    <path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" fill="currentColor" />
    {level === 'muted'
      ? <path d="M16 9.5l5 5M21 9.5l-5 5" />
      : <path d="M15 9.5a3.5 3.5 0 0 1 0 5" />}
    {level === 'high' && <path d="M17.5 7a7 7 0 0 1 0 10" />}
  </Icon>
);

export const MenuIcon = () => (
  <Icon><path d="M4 6h16M4 12h16M4 18h16" /></Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M10 5.3 10.5 2.6 13.5 2.6 14 5.3 15.3 5.8 17.6 4.3 19.7 6.4 18.2 8.7 18.7 10 21.4 10.5 21.4 13.5 18.7 14 18.2 15.3 19.7 17.6 17.6 19.7 15.3 18.2 14 18.7 13.5 21.4 10.5 21.4 10 18.7 8.7 18.2 6.4 19.7 4.3 17.6 5.8 15.3 5.3 14 2.6 13.5 2.6 10.5 5.3 10 5.8 8.7 4.3 6.4 6.4 4.3 8.7 5.8z" strokeWidth={1.6} />
    <circle cx="12" cy="12" r="3" strokeWidth={1.6} />
  </Icon>
);
