import { useMemo, useState } from 'react';
import { usePlayerStore, visibleTracks } from '@/stores/playerStore';
import { useVirtualRows } from '@/hooks/useVirtualRows';
import type { Track } from '@/types';
import './Library.css';

// Doit égaler la hauteur rendue de .track-row : la virtualisation calcule les
// positions sans mesurer le DOM.
const TRACK_ROW_HEIGHT = 47;

// Dessinée plutôt qu'un emoji 🎬 : sans police d'emoji (courant sous Linux),
// celui-ci s'affiche en carré vide.
function VideoIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <path
        fill="currentColor"
        d="M1.5 4.75C1.5 3.78 2.28 3 3.25 3h6.5c.97 0 1.75.78 1.75 1.75v.9l2.4-1.5a.6.6 0 0 1 .9.51v6.68a.6.6 0 0 1-.9.51l-2.4-1.5v.9c0 .97-.78 1.75-1.75 1.75h-6.5c-.97 0-1.75-.78-1.75-1.75z"
      />
    </svg>
  );
}

export function Library() {
  const store = usePlayerStore();
  const {
    tracks, searchQuery, bpmFilter, videoOnly, favoriteIds, isScanning,
    playlists, activePlaylistId, libraryTab: tab, setLibraryTab: setTab,
    currentTrack, setSearchQuery, setCurrentTrack,
    setBpmFilter, setVideoOnly, toggleFavorite,
    createPlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, setActivePlaylist,
  } = store;

  const [showBpmFilter, setShowBpmFilter] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);

  const activePlaylist = tab === 'playlists' ? playlists.find(p => p.id === activePlaylistId) ?? null : null;

  // La même sélection que celle que parcourt « suivant » : la liste affichée
  // et l'ordre de lecture ne peuvent plus diverger.
  const filtered = useMemo(
    () => visibleTracks(store),
    [tracks, searchQuery, bpmFilter, videoOnly, favoriteIds, tab, activePlaylistId, playlists],
  );

  const hasVideos = useMemo(() => tracks.some(t => t.videoPath), [tracks]);

  const { containerRef, start, end, totalHeight, offsetTop } =
    useVirtualRows<HTMLDivElement>(filtered.length, TRACK_ROW_HEIGHT);

  const formatDuration = (secs?: number) => {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
  };

  const bpmValues = useMemo(() => tracks.filter(t => t.bpm).map(t => t.bpm!), [tracks]);
  const minBpm = bpmValues.length ? Math.floor(Math.min(...bpmValues)) : 0;
  const maxBpm = bpmValues.length ? Math.ceil(Math.max(...bpmValues)) : 300;

  const handleCreatePlaylist = () => {
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
  };

  return (
    <div className="library fade-in">
      {/* Tabs */}
      <div className="library-tabs">
        <button className={`lib-tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All</button>
        <button className={`lib-tab ${tab === 'favorites' ? 'active' : ''}`} onClick={() => setTab('favorites')}>♥ Favorites</button>
        <button className={`lib-tab ${tab === 'playlists' ? 'active' : ''}`} onClick={() => setTab('playlists')}>Playlists</button>
      </div>

      {/* Playlist selector */}
      {tab === 'playlists' && (
        <div className="playlist-panel">
          <div className="playlist-list">
            {playlists.length === 0 && (
              <span className="playlist-empty">No playlists yet</span>
            )}
            {playlists.map(p => (
              <div key={p.id} className={`playlist-item ${activePlaylistId === p.id ? 'active' : ''}`}>
                <button className="playlist-name-btn" onClick={() => setActivePlaylist(p.id === activePlaylistId ? null : p.id)}>
                  {p.name} <span className="playlist-count">{p.trackIds.length}</span>
                </button>
                <button className="playlist-del-btn" onClick={() => deletePlaylist(p.id)} title="Delete">×</button>
              </div>
            ))}
          </div>
          <div className="playlist-create">
            <input
              placeholder="New playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
            />
            <button onClick={handleCreatePlaylist}>+</button>
          </div>
        </div>
      )}

      {/* Search + BPM filter */}
      <div className="library-header">
        <div className="library-search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search tracks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
        {bpmValues.length > 0 && (
          <button
            className={`bpm-toggle ${bpmFilter ? 'active' : ''}`}
            onClick={() => setShowBpmFilter(v => !v)}
            title="BPM filter"
          >BPM</button>
        )}
        {hasVideos && (
          <button
            className={`video-toggle ${videoOnly ? 'active' : ''}`}
            onClick={() => setVideoOnly(!videoOnly)}
            title="Only tracks with a video"
          >Video</button>
        )}
        <span className="library-count">{filtered.length} tracks</span>
      </div>

      {showBpmFilter && bpmValues.length > 0 && (
        <div className="bpm-filter">
          <span>{bpmFilter?.[0] ?? minBpm}</span>
          <input
            type="range" min={minBpm} max={maxBpm} step={1}
            value={bpmFilter?.[0] ?? minBpm}
            onChange={(e) => setBpmFilter([+e.target.value, bpmFilter?.[1] ?? maxBpm])}
            className="bpm-range"
          />
          <span>–</span>
          <input
            type="range" min={minBpm} max={maxBpm} step={1}
            value={bpmFilter?.[1] ?? maxBpm}
            onChange={(e) => setBpmFilter([bpmFilter?.[0] ?? minBpm, +e.target.value])}
            className="bpm-range"
          />
          <span>{bpmFilter?.[1] ?? maxBpm}</span>
          <button onClick={() => setBpmFilter(null)} className="bpm-clear">✕</button>
        </div>
      )}

      {/* Add-to-playlist dropdown */}
      {addingToPlaylist && (
        <div className="add-to-playlist-overlay" onClick={() => setAddingToPlaylist(null)}>
          <div className="add-to-playlist-menu" onClick={(e) => e.stopPropagation()}>
            <div className="add-to-playlist-title">Add to playlist</div>
            {playlists.length === 0 && <div className="add-to-playlist-empty">No playlists</div>}
            {playlists.map(p => (
              <button key={p.id} className="add-to-playlist-item" onClick={() => {
                addToPlaylist(p.id, addingToPlaylist);
                setAddingToPlaylist(null);
              }}>{p.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="library-list" ref={containerRef}>
        {filtered.length === 0 ? (
          <div className="library-empty">
            {tracks.length === 0 && isScanning ? (
              // Un premier scan peut durer : sans ce message, la liste vide
              // invitait à relancer un scan déjà en cours.
              <>
                <p>Scanning your osu! folder…</p>
                <small>This can take a while the first time</small>
              </>
            ) : tracks.length === 0 ? (
              <>
                <p>No tracks found</p>
                <small>Go to ⚙ Settings to scan your osu! folder</small>
              </>
            ) : (
              <p>No results</p>
            )}
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <div style={{ transform: `translateY(${offsetTop}px)` }}>
              {filtered.slice(start, end).map((track: Track) => (
                <div
                  key={track.id}
                  className={`track-row ${currentTrack?.id === track.id ? 'active' : ''}`}
                  style={{ height: TRACK_ROW_HEIGHT }}
                  onClick={() => setCurrentTrack(track)}
                >
                  <div className="track-thumb">
                    {currentTrack?.id === track.id ? (
                      <span className="track-playing">▶</span>
                    ) : track.videoPath ? (
                      <span className="track-video" title="Has a video"><VideoIcon /></span>
                    ) : (
                      <span className="track-num">♪</span>
                    )}
                  </div>
                  <div className="track-info">
                    <div className="track-title">{track.title}</div>
                    <div className="track-artist">{track.artist}</div>
                  </div>
                  <div className="track-meta">
                    {track.bpm && <span className="track-bpm">{Math.round(track.bpm)}</span>}
                    <span className="track-duration">{formatDuration(track.duration)}</span>
                  </div>
                  <div className="track-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`track-fav-btn ${favoriteIds.has(track.id) ? 'active' : ''}`}
                      onClick={() => toggleFavorite(track.id)}
                      title="Favorite"
                    >♥</button>
                    {playlists.length > 0 && (
                      <button
                        className="track-playlist-btn"
                        onClick={() => setAddingToPlaylist(track.id)}
                        title="Add to playlist"
                      >+</button>
                    )}
                    {activePlaylist && (
                      <button
                        className="track-remove-btn"
                        onClick={() => removeFromPlaylist(activePlaylist.id, track.id)}
                        title={`Remove from ${activePlaylist.name}`}
                      >×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
