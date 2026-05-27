import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, PlayerStatus, RepeatMode, Theme } from '@/types';

interface PlayerState {
  tracks: Track[];
  searchQuery: string;
  songsFolder: string;
  isScanning: boolean;
  currentTrack: Track | null;
  status: PlayerStatus;
  progress: number;
  volume: number;
  isMuted: boolean;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  currentTheme: Theme | null;
  showLibrary: boolean;
  showSettings: boolean;
  isSphereMode: boolean;

  setTracks: (tracks: Track[]) => void;
  setSearchQuery: (q: string) => void;
  setSongsFolder: (path: string) => void;
  setIsScanning: (v: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setStatus: (status: PlayerStatus) => void;
  setProgress: (p: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setTheme: (theme: Theme) => void;
  setShowLibrary: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  toggleSphereMode: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
}

function filterTracks(tracks: Track[], query: string): Track[] {
  if (!query) return tracks;
  const q = query.toLowerCase();
  return tracks.filter(t =>
    t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      tracks: [], searchQuery: '',
      songsFolder: 'C:\\osu!\\Songs', isScanning: false,
      currentTrack: null, status: 'idle', progress: 0,
      volume: 0.8, isMuted: false, isShuffled: false, repeatMode: 'none',
      currentTheme: null, showLibrary: true, showSettings: false, isSphereMode: false,

      setTracks: (tracks) => set({ tracks }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSongsFolder: (songsFolder) => set({ songsFolder }),
      setIsScanning: (isScanning) => set({ isScanning }),
      setCurrentTrack: (currentTrack) => set({ currentTrack, progress: 0 }),
      setStatus: (status) => set({ status }),
      setProgress: (progress) => set({ progress }),
      setVolume: (volume) => set({ volume, isMuted: false }),
      toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
      toggleShuffle: () => set((s) => ({ isShuffled: !s.isShuffled })),
      cycleRepeat: () => set((s) => ({
        repeatMode: s.repeatMode === 'none' ? 'all' : s.repeatMode === 'all' ? 'one' : 'none'
      })),
      setTheme: (currentTheme) => set({ currentTheme }),
      setShowLibrary: (showLibrary) => set({ showLibrary }),
      setShowSettings: (showSettings) => set({ showSettings }),
      toggleSphereMode: () => set((s) => ({ isSphereMode: !s.isSphereMode })),

      nextTrack: () => {
        const { currentTrack, tracks, searchQuery, isShuffled, repeatMode } = get();
        const visible = filterTracks(tracks, searchQuery);
        if (!visible.length) return;
        const idx = visible.findIndex((t) => t.id === currentTrack?.id);
        let nextIdx = isShuffled
          ? Math.floor(Math.random() * visible.length)
          : idx + 1 >= visible.length
          ? repeatMode === 'all' ? 0 : -1
          : idx + 1;
        if (nextIdx >= 0) set({ currentTrack: visible[nextIdx], progress: 0, status: 'loading' });
      },

      prevTrack: () => {
        const { currentTrack, tracks, searchQuery, progress } = get();
        const visible = filterTracks(tracks, searchQuery);
        if (!visible.length) return;
        if (progress > 0.05) { set({ progress: 0, status: 'loading' }); return; }
        const idx = visible.findIndex((t) => t.id === currentTrack?.id);
        const prevIdx = idx > 0 ? idx - 1 : visible.length - 1;
        set({ currentTrack: visible[prevIdx], progress: 0, status: 'loading' });
      },
    }),
    {
      name: 'osu-player-storage',
      partialize: (s) => ({
        songsFolder: s.songsFolder,
        volume: s.volume,
        isShuffled: s.isShuffled,
        repeatMode: s.repeatMode,
        currentTheme: s.currentTheme,
      }),
    }
  )
);
