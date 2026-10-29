import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, PlayerStatus, RepeatMode, Theme, Playlist } from '@/types';

interface PlayerState {
  tracks: Track[];
  searchQuery: string;
  bpmFilter: [number, number] | null;
  favoritesOnly: boolean;
  favoriteIds: Set<string>;
  playlists: Playlist[];
  activePlaylistId: string | null;
  songsFolder: string;
  isScanning: boolean;
  currentTrack: Track | null;
  status: PlayerStatus;
  progress: number;
  /** Position de lecture en secondes, pour caler la vidéo de la beatmap. */
  audioTime: number;
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
  setBpmFilter: (range: [number, number] | null) => void;
  setFavoritesOnly: (v: boolean) => void;
  toggleFavorite: (id: string) => void;
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackId: string) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  setActivePlaylist: (id: string | null) => void;
  setSongsFolder: (path: string) => void;
  setIsScanning: (v: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setStatus: (status: PlayerStatus) => void;
  setProgress: (p: number) => void;
  setPlayback: (progress: number, audioTime: number) => void;
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

export function filterTracks(
  tracks: Track[],
  query: string,
  bpmFilter: [number, number] | null,
  favoritesOnly: boolean,
  favoriteIds: Set<string>,
  playlistTrackIds: string[] | null,
): Track[] {
  let result = playlistTrackIds
    ? tracks.filter(t => playlistTrackIds.includes(t.id))
    : tracks;
  if (favoritesOnly) result = result.filter(t => favoriteIds.has(t.id));
  if (bpmFilter) result = result.filter(t => t.bpm != null && t.bpm >= bpmFilter[0] && t.bpm <= bpmFilter[1]);
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  }
  return result;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      tracks: [], searchQuery: '', bpmFilter: null,
      favoritesOnly: false, favoriteIds: new Set<string>(),
      playlists: [], activePlaylistId: null,
      songsFolder: '', isScanning: false,
      currentTrack: null, status: 'idle', progress: 0, audioTime: 0,
      volume: 0.8, isMuted: false, isShuffled: false, repeatMode: 'none',
      currentTheme: null, showLibrary: true, showSettings: false, isSphereMode: false,

      setTracks: (tracks) => set({ tracks }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setBpmFilter: (bpmFilter) => set({ bpmFilter }),
      setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
      toggleFavorite: (id) => set((s) => {
        const next = new Set(s.favoriteIds);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { favoriteIds: next };
      }),
      createPlaylist: (name) => set((s) => ({
        playlists: [...s.playlists, { id: crypto.randomUUID(), name, trackIds: [] }],
      })),
      deletePlaylist: (id) => set((s) => ({
        playlists: s.playlists.filter(p => p.id !== id),
        activePlaylistId: s.activePlaylistId === id ? null : s.activePlaylistId,
      })),
      addToPlaylist: (playlistId, trackId) => set((s) => ({
        playlists: s.playlists.map(p =>
          p.id === playlistId && !p.trackIds.includes(trackId)
            ? { ...p, trackIds: [...p.trackIds, trackId] }
            : p
        ),
      })),
      removeFromPlaylist: (playlistId, trackId) => set((s) => ({
        playlists: s.playlists.map(p =>
          p.id === playlistId
            ? { ...p, trackIds: p.trackIds.filter(id => id !== trackId) }
            : p
        ),
      })),
      setActivePlaylist: (activePlaylistId) => set({ activePlaylistId }),
      setSongsFolder: (songsFolder) => set({ songsFolder }),
      setIsScanning: (isScanning) => set({ isScanning }),
      setCurrentTrack: (currentTrack) => set({ currentTrack, progress: 0, audioTime: 0 }),
      setStatus: (status) => set({ status }),
      setProgress: (progress) => set({ progress }),
      // Une seule mise à jour pour les deux : chacune re-rend tous les abonnés.
      setPlayback: (progress, audioTime) => set({ progress, audioTime }),
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
        const { currentTrack, tracks, searchQuery, bpmFilter, favoritesOnly, favoriteIds, playlists, activePlaylistId, isShuffled, repeatMode } = get();
        const playlist = playlists.find(p => p.id === activePlaylistId);
        const visible = filterTracks(tracks, searchQuery, bpmFilter, favoritesOnly, favoriteIds, playlist?.trackIds ?? null);
        if (!visible.length) return;
        const idx = visible.findIndex((t) => t.id === currentTrack?.id);
        let nextIdx = isShuffled
          ? Math.floor(Math.random() * visible.length)
          : idx + 1 >= visible.length
          ? repeatMode === 'all' ? 0 : -1
          : idx + 1;
        if (nextIdx >= 0) set({ currentTrack: visible[nextIdx], progress: 0, audioTime: 0, status: 'loading' });
      },

      prevTrack: () => {
        const { currentTrack, tracks, searchQuery, bpmFilter, favoritesOnly, favoriteIds, playlists, activePlaylistId, progress } = get();
        const playlist = playlists.find(p => p.id === activePlaylistId);
        const visible = filterTracks(tracks, searchQuery, bpmFilter, favoritesOnly, favoriteIds, playlist?.trackIds ?? null);
        if (!visible.length) return;
        if (progress > 0.05) { set({ progress: 0, audioTime: 0, status: 'loading' }); return; }
        const idx = visible.findIndex((t) => t.id === currentTrack?.id);
        const prevIdx = idx > 0 ? idx - 1 : visible.length - 1;
        set({ currentTrack: visible[prevIdx], progress: 0, audioTime: 0, status: 'loading' });
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
        favoriteIds: Array.from(s.favoriteIds),
        playlists: s.playlists,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        favoriteIds: new Set<string>(persisted.favoriteIds ?? []),
      }),
    }
  )
);
