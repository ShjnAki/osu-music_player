# 🎵 osu! Player

Un lecteur de musique bureau léger et personnalisable pour ta collection de beatmaps osu!

Développé avec **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Fonctionnalités

- 🎵 Lecture des fichiers MP3 et OGG depuis ton dossier osu! Songs
- 📋 Bibliothèque avec recherche (titre / artiste)
- 🎨 4 thèmes intégrés (Dark, Glass, Sakura, Minimal) — d'autres à venir
- 🔀 Modes aléatoire et répétition
- 🔊 Contrôle du volume
- 🏷️ Lecture des tags ID3 (titre, artiste, BPM)
- 🖼️ Pochette d'album depuis le dossier de la beatmap
- 💾 Paramètres sauvegardés entre les sessions
- 🪟 Fenêtre sans bordure, déplaçable

## Prérequis

- [Node.js 18+](https://nodejs.org/) LTS version
- [Rust (stable)](https://rustup.rs/) ou `winget install Rustlang.Rustup` puis `rustup default stable`
- [Prérequis Tauri pour Windows](https://v2.tauri.app/start/prerequisites/)
  - Microsoft C++ Build Tools `winget install Microsoft.VisualStudio.2022.BuildTools`
  - WebView2

## Démarrage rapide

```bash
# Installer les dépendances
npm install

# Développement (hot-reload)
npm run tauri dev

# Build de production
npm run tauri build
```

## Structure du projet

```
osu-player/
├── src/                      # Frontend React
│   ├── components/
│   │   ├── Player/           # PlayerBar (contrôles, progression)
│   │   ├── Library/          # Liste des pistes + recherche
│   │   └── Settings/         # Thèmes, sélecteur de dossier
│   ├── hooks/
│   │   ├── useAudio.ts       # Moteur de lecture Howler.js
│   │   └── useTheme.ts       # Thèmes via variables CSS
│   ├── stores/
│   │   └── playerStore.ts    # État global Zustand
│   ├── types/index.ts        # Interfaces TypeScript
│   └── styles/globals.css
├── src-tauri/                # Backend Rust
│   └── src/
│       └── lib.rs            # scan_osu_songs, parse_osu_bpm, read_audio_file
├── themes/                   # Fichiers de thèmes JSON
│   ├── default.json
│   ├── glass.json
│   ├── sakura.json
│   └── minimal.json
└── tauri.conf.json
```

## Créer un thème personnalisé

Copie n'importe quel fichier `themes/*.json` et modifie les variables CSS :

```json
{
  "id": "mon-theme",
  "name": "Mon Thème",
  "author": "moi",
  "variables": {
    "--bg-primary": "#0a0a0a",
    "--accent": "#00ff88",
    ...
  }
}
```

## Feuille de route

- [ ] Chargeur de thèmes personnalisés depuis un fichier
- [ ] Mode mini widget (toujours au premier plan, compact)
- [ ] Parseur de fichiers `.osu` pour l'affichage du BPM
- [ ] Gestion des playlists / file de lecture
- [ ] Raccourcis clavier globaux
- [ ] Icône dans la barre des tâches (system tray)
- [ ] Android / iOS (Tauri 2.0 mobile)
- [ ] Visualiseur de forme d'onde

## Licence

MIT — Fork-le, modifie-le, partage-le ! 🎮