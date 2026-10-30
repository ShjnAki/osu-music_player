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
  backgroundPath?: string;
  videoPath?: string;
  videoOffsetMs?: number;
  previewTimeMs?: number;
}

export interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
}

export interface Theme {
  id: string;
  name: string;
  variables: ThemeVariables;
}

export interface ThemeVariables {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-tertiary': string;
  '--accent': string;
  '--accent-hover': string;
  '--accent-subtle': string;
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
export type LibraryTab = 'all' | 'favorites' | 'playlists';
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';