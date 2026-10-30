import { usePlayerStore } from '@/stores/playerStore';
import { useTheme } from '@/hooks/useTheme';
import { open } from '@tauri-apps/plugin-dialog';
import './Settings.css';

interface Props { onScan: () => void; isScanning: boolean; }

export function Settings({ onScan, isScanning }: Props) {
  const {
    songsFolder, setSongsFolder, setShowSettings,
    hideSphereControlsOverVideo, setHideSphereControlsOverVideo,
  } = usePlayerStore();
  const { themes, currentTheme, setTheme } = useTheme();

  const handlePickFolder = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: 'Select osu! Songs folder' });
      if (selected && typeof selected === 'string') setSongsFolder(selected);
    } catch (e) { console.warn('Dialog error:', e); }
  };

  return (
    <div className="settings fade-in">
      <div className="settings-header">
        <button className="back-btn" onClick={() => setShowSettings(false)}>← Back</button>
        <h2>Settings</h2>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h3>Music Library</h3>
          <div className="settings-row">
            <label>Songs folder</label>
            <div className="folder-row">
              <span className="folder-path">{songsFolder}</span>
              <button className="btn-secondary" onClick={handlePickFolder}>Browse</button>
            </div>
          </div>
          <button className={`btn-primary ${isScanning ? 'loading' : ''}`} onClick={onScan} disabled={isScanning}>
            {isScanning ? 'Scanning...' : 'Scan folder'}
          </button>
        </section>

        <section className="settings-section">
          <h3>Videos</h3>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={hideSphereControlsOverVideo}
              onChange={(e) => setHideSphereControlsOverVideo(e.target.checked)}
            />
            <span>
              Hide sphere controls over videos
              <small>They come back when the pointer is over the sphere.</small>
            </span>
          </label>
        </section>

        <section className="settings-section">
          <h3>Themes</h3>
          <div className="themes-grid">
            {themes.map((theme) => (
              <button
                key={theme.id}
                className={`theme-card ${currentTheme?.id === theme.id ? 'selected' : ''}`}
                onClick={() => setTheme(theme)}
                style={{
                  '--card-accent': theme.variables['--accent'],
                  '--card-bg': theme.variables['--bg-primary'],
                } as React.CSSProperties}
              >
                <div className="theme-preview">
                  <div className="theme-preview-bar" style={{ background: theme.variables['--accent'] }} />
                  <div className="theme-preview-lines">
                    <div style={{ background: theme.variables['--text-primary'], opacity: 0.8 }} />
                    <div style={{ background: theme.variables['--text-secondary'], opacity: 0.5, width: '60%' }} />
                  </div>
                </div>
                <span>{theme.name}</span>
                {currentTheme?.id === theme.id && <span className="theme-check">✓</span>}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Osu! Player v0.2.0</h3>
          <p className="about-text"><b>Open source, lightweight music player for osu! beatmaps.</b></p>
          <p className="about-text muted">MIT — Fork it, mod it, share it! 🎮 <b>Shin Aki</b></p>
          <a href="https://github.com/ShjnAki" target="_blank" rel="noopener noreferrer" className="github-link">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
          </svg>
          ShjnAki
          </a>
        </section>
      </div>
    </div>
  );
}
