import { useMemo, useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import type { Track } from '@/types';
import './Library.css';

export function Library() {
  const { tracks, searchQuery, currentTrack, setSearchQuery, setCurrentTrack, setFilteredTracks } = usePlayerStore();

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return q ? tracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q)
    ) : tracks;
  }, [tracks, searchQuery]);

  // ✅ useEffect pour éviter le setState pendant le render
  useEffect(() => {
    setFilteredTracks(filtered);
  }, [filtered]);

  const handlePlay = (track: Track) => {
    setCurrentTrack(track);
  };

  const formatDuration = (secs?: number) => {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}:${Math.floor(secs % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="library fade-in">
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
        <span className="library-count">{filtered.length} tracks</span>
      </div>

      <div className="library-list">
        {filtered.length === 0 ? (
          <div className="library-empty">
            {tracks.length === 0 ? (
              <>
                <p>No tracks found</p>
                <small>Go to ⚙ Settings to scan your osu! folder</small>
              </>
            ) : (
              <p>No results for "{searchQuery}"</p>
            )}
          </div>
        ) : (
          filtered.map((track) => (
            <div
              key={track.id}
              className={`track-row ${currentTrack?.id === track.id ? 'active' : ''}`}
              onClick={() => handlePlay(track)}
            >
              <div className="track-thumb">
                {currentTrack?.id === track.id ? (
                  <span className="track-playing">▶</span>
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}