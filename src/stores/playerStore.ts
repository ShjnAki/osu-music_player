import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Track, PlayerStatus, RepeatMode, Theme, Playlist, LibraryTab } from '@/types';

interface PlayerState {
  tracks: Track[];
  searchQuery: string;
  bpmFilter: [number, number] | null;
  /** Seulement les pistes qui ont une vidéo : pour en voir le rendu sans les chercher. */
  videoOnly: boolean;
  favoriteIds: Set<string>;
  playlists: Playlist[];
  activePlaylistId: string | null;
  /** Onglet de la bibliothèque : il délimite aussi ce que « suivant » parcourt. */
  libraryTab: LibraryTab;
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
  /** Efface les contrôles quand on ne s'en sert pas, pour laisser voir la vidéo, le visualiseur ou l'image de fond. */
  hideControlsOverVideo: boolean;
  /** Visualiseur pour les pistes sans vidéo ; il en analyse une copie silencieuse par Web Audio. */
  showVisualizer: boolean;
  /** Fenêtre épinglée au premier plan, dans les deux modes. */
  alwaysOnTop: boolean;
  /** Un seul exemplaire d'un morceau présent dans plusieurs beatmaps. */
  hideDuplicates: boolean;

  setTracks: (tracks: Track[]) => void;
  setSearchQuery: (q: string) => void;
  setBpmFilter: (range: [number, number] | null) => void;
  setVideoOnly: (v: boolean) => void;
  toggleFavorite: (id: string) => void;
  createPlaylist: (name: string) => void;
  deletePlaylist: (id: string) => void;
  addToPlaylist: (playlistId: string, trackId: string) => void;
  removeFromPlaylist: (playlistId: string, trackId: string) => void;
  setActivePlaylist: (id: string | null) => void;
  setLibraryTab: (tab: LibraryTab) => void;
  setSongsFolder: (path: string) => void;
  setIsScanning: (v: boolean) => void;
  setCurrentTrack: (track: Track | null) => void;
  setStatus: (status: PlayerStatus) => void;
  setPlayback: (progress: number, audioTime: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setTheme: (theme: Theme) => void;
  setShowLibrary: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
  toggleSphereMode: () => void;
  setHideControlsOverVideo: (v: boolean) => void;
  setShowVisualizer: (v: boolean) => void;
  setAlwaysOnTop: (v: boolean) => void;
  setHideDuplicates: (v: boolean) => void;
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
  videoOnly = false,
  hideDuplicates = false,
  keepId?: string,
): Track[] {
  let result = playlistTrackIds
    ? tracks.filter(t => playlistTrackIds.includes(t.id))
    : tracks;
  if (favoritesOnly) result = result.filter(t => favoriteIds.has(t.id));
  if (bpmFilter) result = result.filter(t => t.bpm != null && t.bpm >= bpmFilter[0] && t.bpm <= bpmFilter[1]);
  if (videoOnly) result = result.filter(t => t.videoPath);
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q));
  }
  // En dernier : parmi les copies qui passent les filtres (celle qui a une
  // vidéo, avec le filtre Video), pas parmi toutes.
  return hideDuplicates ? withoutDuplicates(result, keepId) : result;
}

// Au-delà, ce n'est plus le même enregistrement : version TV, extrait, autre
// montage. En deçà, les mêmes fichiers diffèrent par leur silence de fin.
const SAME_LENGTH_SECS = 2;

const normalize = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Un exemplaire par morceau : même titre et même artiste, à la casse et aux
 * espaces près, et même durée. Le même morceau revient souvent dans plusieurs
 * beatmaps, une par mappeur. `keepId` (la piste en cours) est l'exemplaire
 * gardé de son groupe, sans quoi la liste perdrait sa surbrillance et
 * « suivant » son point de départ.
 */
export function withoutDuplicates(tracks: Track[], keepId?: string): Track[] {
  const kept = new Map<string, Track[]>();
  const keyOf = (t: Track) => `${normalize(t.title)}\u0000${normalize(t.artist)}`;
  const sameLength = (a: Track, b: Track) =>
    a.duration == null || b.duration == null || Math.abs(a.duration - b.duration) <= SAME_LENGTH_SECS;
  const preferred = keepId ? tracks.find(t => t.id === keepId) : undefined;
  if (preferred) kept.set(keyOf(preferred), [preferred]);
  return tracks.filter((t) => {
    if (t === preferred) return true;
    const key = keyOf(t);
    const group = kept.get(key);
    if (group?.some(k => sameLength(k, t))) return false;
    if (group) group.push(t); else kept.set(key, [t]);
    return true;
  });
}

/**
 * Pistes de la vue en cours de la bibliothèque : celles qu'elle affiche, et
 * donc celles que « suivant », « précédent » et le préchargement parcourent.
 * L'onglet compte : une playlist ouverte puis quittée ne s'applique plus.
 */
export function visibleTracks(s: PlayerState): Track[] {
  const playlist = s.libraryTab === 'playlists'
    ? s.playlists.find(p => p.id === s.activePlaylistId)
    : undefined;
  return filterTracks(
    s.tracks, s.searchQuery, s.bpmFilter,
    s.libraryTab === 'favorites', s.favoriteIds,
    playlist?.trackIds ?? null, s.videoOnly,
    s.hideDuplicates, s.currentTrack?.id,
  );
}

/**
 * Piste que « suivant » jouera hors lecture aléatoire, ou null si aucune.
 * Partagée avec le préchargement, qui doit prédire exactement le même choix.
 */
export function predictNextTrack(s: PlayerState): Track | null {
  if (s.isShuffled) return null;
  const visible = visibleTracks(s);
  if (!visible.length) return null;
  const idx = visible.findIndex((t) => t.id === s.currentTrack?.id);
  if (idx + 1 < visible.length) return visible[idx + 1];
  return s.repeatMode === 'all' ? visible[0] : null;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      tracks: [], searchQuery: '', bpmFilter: null, videoOnly: false,
      favoriteIds: new Set<string>(),
      playlists: [], activePlaylistId: null, libraryTab: 'all',
      songsFolder: '', isScanning: false,
      currentTrack: null, status: 'idle', progress: 0, audioTime: 0,
      volume: 0.8, isMuted: false, isShuffled: false, repeatMode: 'none',
      currentTheme: null, showLibrary: true, showSettings: false, isSphereMode: false,
      hideControlsOverVideo: true,
      showVisualizer: true,
      alwaysOnTop: false,
      hideDuplicates: true,

      setTracks: (tracks) => set({ tracks }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setBpmFilter: (bpmFilter) => set({ bpmFilter }),
      setVideoOnly: (videoOnly) => set({ videoOnly }),
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
      setLibraryTab: (libraryTab) => set({ libraryTab }),
      setSongsFolder: (songsFolder) => set({ songsFolder }),
      setIsScanning: (isScanning) => set({ isScanning }),
      setCurrentTrack: (currentTrack) => set({ currentTrack, progress: 0, audioTime: 0 }),
      setStatus: (status) => set({ status }),
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
      setHideControlsOverVideo: (hideControlsOverVideo) => set({ hideControlsOverVideo }),
      setShowVisualizer: (showVisualizer) => set({ showVisualizer }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
      setHideDuplicates: (hideDuplicates) => set({ hideDuplicates }),

      nextTrack: () => {
        const state = get();
        const visible = visibleTracks(state);
        const next = state.isShuffled
          ? visible[Math.floor(Math.random() * visible.length)]
          : predictNextTrack(state);
        if (next) set({ currentTrack: next, progress: 0, audioTime: 0, status: 'loading' });
      },

      // Revenir au début du morceau en cours relève de useAudio, qui tient
      // l'élément audio : ici, seulement changer de piste.
      prevTrack: () => {
        const state = get();
        const visible = visibleTracks(state);
        if (!visible.length) return;
        const idx = visible.findIndex((t) => t.id === state.currentTrack?.id);
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
        hideControlsOverVideo: s.hideControlsOverVideo,
        showVisualizer: s.showVisualizer,
        alwaysOnTop: s.alwaysOnTop,
        hideDuplicates: s.hideDuplicates,
      }),
      merge: (persisted: any, current) => ({
        ...current,
        ...persisted,
        favoriteIds: new Set<string>(persisted.favoriteIds ?? []),
      }),
    }
  )
);
