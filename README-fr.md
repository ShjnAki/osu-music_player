# 🎵 osu! Player

Un lecteur de musique bureau léger et personnalisable pour ta collection de beatmaps osu!

Développé avec **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Téléchargement

**[⬇️ Télécharger la dernière version](https://github.com/ShjnAki/osu-music_player/releases/latest)** — installeur Windows, aucune compilation nécessaire.

Récupère le `.msi` (ou l'installeur NSIS `.exe`), lance-le, puis indique ton dossier osu! `Songs` au premier démarrage.

Tu préfères compiler toi-même ? Voir [Démarrage rapide](#démarrage-rapide).

## Fonctionnalités

- 🎵 Lecture des fichiers MP3 et OGG depuis ton dossier osu! Songs
- 📋 Bibliothèque avec recherche (titre / artiste) et filtre des pistes avec vidéo
- 🎨 4 thèmes intégrés (Dark, Glass, Sakura, Minimal) — d'autres à venir
- 🔀 Modes aléatoire et répétition
- 🔊 Contrôle du volume
- 🏷️ Lecture des tags ID3 (titre, artiste, BPM)
- 🖼️ Pochette d'album depuis le dossier de la beatmap
- 🎬 Vidéos des beatmaps, muettes et calées sur la musique, en grand quand la liste est masquée (☰)
- 💾 Paramètres sauvegardés entre les sessions
- 🪟 Fenêtre sans bordure, déplaçable

## Captures d'écran

| Mode sphère | Bibliothèque |
| --- | --- |
| ![Mode sphère](docs/screenshot-sphere.png) | ![Bibliothèque](docs/screenshot-library.png) |

## Prérequis

- [Node.js 18+](https://nodejs.org/) LTS version
- [Rust (stable)](https://rustup.rs/) ou `winget install Rustlang.Rustup` puis `rustup default stable`
- [Prérequis Tauri pour Windows](https://v2.tauri.app/start/prerequisites/)
  - Microsoft C++ Build Tools `winget install Microsoft.VisualStudio.2022.BuildTools`
  - WebView2

## Démarrage rapide

Pour les contributeurs, ou si tu préfères compiler depuis les sources plutôt qu'utiliser l'[installeur prêt à l'emploi](#téléchargement) :

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
│   │   ├── Settings/         # Thèmes, sélecteur de dossier
│   │   ├── SphereView/       # Mode sphère
│   │   └── BeatmapVideo/     # Vidéo de la beatmap, muette, calée sur la musique
│   ├── hooks/
│   │   ├── useAudio.ts       # Moteur de lecture (<audio> natif, préchargement de la suivante)
│   │   └── useTheme.ts       # Thèmes via variables CSS
│   ├── stores/
│   │   └── playerStore.ts    # État global Zustand
│   ├── types/index.ts        # Interfaces TypeScript
│   └── styles/globals.css
├── src-tauri/                # Backend Rust
│   └── src/
│       ├── lib.rs            # Commandes Tauri : scan, cache, mode sphère, serveur média
│       ├── osu_parse.rs      # Lecture des .osu : BPM, fond, vidéo
│       └── media_server.rs   # Serveur HTTP local des médias (Linux)
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