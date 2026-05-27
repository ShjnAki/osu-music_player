export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  bpm?: number;
  duration?: number;
  path: string;
  beatmapSet?: string;
  coverPath?: string;
  backgroundPath?: string; // ← image de fond depuis le .osu
}

export interface Theme {
  id: string;
  name: string;
  author?: string;
  variables: ThemeVariables;
}

export interface ThemeVariables {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary': string;
  '--accent': string;
  '--accent-hover': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--text-muted': string;
  '--radius': string;
  '--blur': string;
  '--border': string;
  '--font-main': string;
  '--bg-opacity': string;
}

export type RepeatMode = 'none' | 'one' | 'all';
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';