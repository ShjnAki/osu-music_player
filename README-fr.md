# 🎵 osu! Player

Un lecteur de musique de bureau léger et personnalisable pour ta collection de beatmaps osu!

Développé avec **Tauri 2.0** (Rust) + **React 18** + **TypeScript**.

## Téléchargement

**[⬇️ Télécharger la dernière version](https://github.com/ShjnAki/osu-music_player/releases/latest)** — aucune compilation nécessaire.

- **Windows** — le `.msi`, ou l'installeur NSIS `.exe`
- **Linux** — l'`.AppImage` (portable : `chmod +x`, puis lance-le) ou le `.deb`

Au premier démarrage, l'appli cherche seule ton dossier osu! `Songs`, y compris dans les préfixes Wine et les disques montés par WSL sous Linux, et ouvre le sélecteur de dossier si elle n'en trouve pas.

Tu préfères compiler toi-même ? Voir [Démarrage rapide](#démarrage-rapide).

## Fonctionnalités

- 🎵 Lecture des fichiers MP3 et OGG de ton dossier osu! Songs, sur n'importe quel disque (`S:\` compris) et depuis WSL
- 📋 Bibliothèque avec recherche (titre / artiste), filtre de BPM et filtre des pistes avec vidéo
- ❤️ Favoris et playlists : ajoute des pistes, retire-les avec **×**
- 🎨 4 thèmes intégrés (Dark, Glass, Sakura, Minimal), avec des contrôles dessinés en icônes, lisibles dans tous les thèmes
- 🔀 Modes aléatoire et répétition (toute la liste, ou une seule piste) ; **Précédent** revient d'abord au début du morceau, comme sur la plupart des lecteurs
- 🔊 Contrôle du volume
- 🏷️ Lecture des tags ID3 (titre, artiste), avec repli sur le nom du dossier
- 🖼️ Pochette et image de fond de la beatmap
- 🎬 Vidéos des beatmaps, muettes et calées sur la musique, en grand quand la liste est masquée (☰)
- 🎛️ Visualiseur du spectre pour les pistes sans vidéo : des barres dans la fenêtre, un anneau dans la sphère. Il analyse une copie silencieuse de la piste : le son que tu entends n'en dépend jamais
- ✨ Pendant la lecture, les contrôles s'effacent quand tu ne t'en sers pas, pour laisser voir la vidéo, le visualiseur ou l'image de fond, nette (Réglages → Videos)
- 🔵 Mode sphère : une fenêtre ronde avec la liste des pistes à l'intérieur
- 📌 Épingle au premier plan, en option, dans la barre de titre et la sphère — voir [Premier plan](#premier-plan)
- ⚡ Cache des métadonnées : le premier scan est lent, les lancements suivants sont instantanés ; la piste suivante est préchargée pour démarrer tout de suite
- 💾 Paramètres sauvegardés entre les sessions
- 🪟 Fenêtre sans bordure : déplace-la par la barre de titre, redimensionne-la par ses bords ou la poignée en bas à droite

## Captures d'écran

| Mode sphère | Bibliothèque |
| --- | --- |
| ![Mode sphère](docs/screenshot-sphere.png) | ![Bibliothèque](docs/screenshot-library.png) |

## Prérequis

- [Node.js 18+](https://nodejs.org/) version LTS
- [Rust (stable)](https://rustup.rs/) ou `winget install Rustlang.Rustup` puis `rustup default stable`
- [Prérequis Tauri](https://v2.tauri.app/start/prerequisites/) de ta plateforme :
  - **Windows** — Microsoft C++ Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools`, avec la charge de travail C++) et WebView2 (inclus dans Windows 11, installeur disponible pour Windows 10)
  - **Linux** — `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` (Debian/Ubuntu ; voir la doc Tauri pour les autres distributions), plus `gstreamer1.0-plugins-good gstreamer1.0-libav` pour lire les MP3 et les vidéos

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
├── src/                        # Frontend React
│   ├── components/
│   │   ├── BeatmapVideo/       # Vidéo de la beatmap, muette, calée sur la musique
│   │   ├── Icons/              # Icônes SVG des contrôles (couleur du thème)
│   │   ├── Library/            # Liste des pistes, recherche, favoris, playlists, filtres BPM et vidéo
│   │   ├── PinButton/          # Épingle au premier plan, et la marche à suivre là où l'appli ne peut pas
│   │   ├── Player/             # PlayerBar : contrôles, progression, pochette
│   │   ├── ResizeHandles/      # Bords et poignée de redimensionnement de la fenêtre sans bordure
│   │   ├── Settings/           # Sélecteur de dossier, thèmes, options des vidéos
│   │   ├── SphereView/         # Mode sphère
│   │   ├── Stage/              # Vidéo ou visualiseur en grand quand la liste est masquée
│   │   └── Visualizer/         # Barres et anneau du spectre
│   ├── hooks/
│   │   ├── useAlwaysOnTop.ts   # Applique l'épingle : par la fenêtre, ou par Windows sous WSL
│   │   ├── useAudio.ts         # Moteur de lecture (<audio> natif, préchargement de la suivante)
│   │   ├── useAutoHide.ts      # Efface les contrôles après un moment sans bouger le pointeur
│   │   ├── useTheme.ts         # Thèmes par variables CSS + 4 thèmes intégrés
│   │   └── useVirtualRows.ts   # N'affiche que les lignes visibles des listes de pistes
│   ├── lib/
│   │   ├── audioAnalysis.ts    # Analyse Web Audio d'une copie silencieuse de la piste, pour le visualiseur
│   │   └── localMedia.ts       # Adresses des médias : asset:// ou le serveur média sous Linux
│   ├── stores/
│   │   └── playerStore.ts      # État global Zustand (sauvegardés : dossier, volume, thème, favoris, playlists, options)
│   ├── types/index.ts          # Interfaces TypeScript
│   └── styles/globals.css
└── src-tauri/                  # Backend Rust
    └── src/
        ├── lib.rs              # Commandes Tauri : scan, cache, mode sphère, serveur média, premier plan
        ├── osu_parse.rs        # Lecture des .osu : BPM, fond, vidéo
        ├── media_server.rs     # Serveur HTTP local des médias (Linux)
        └── wsl_pin.rs          # Premier plan sous WSL, demandé à Windows par PowerShell
```

## Mode sphère

Clique sur **◎** dans la barre de titre pour passer en mode sphère : une fenêtre ronde de 360×360. L'épingle de son coin haut gauche, comme celle de la barre de titre, la garde au-dessus des autres fenêtres. L'image de fond de la beatmap, ou sa vidéo, remplit la sphère. Déplace la sphère depuis n'importe quel point libre. Pendant la lecture, la liste et les contrôles s'effacent après un moment sans bouger le pointeur, pour laisser voir la vidéo, le visualiseur ou l'image de fond, nette ; ils reviennent dès que le pointeur bouge (Réglages → Videos pour le désactiver). Clique sur **⊡** pour revenir au mode normal.

## Premier plan

Clique sur l'épingle de la barre de titre, ou du coin haut gauche de la sphère, pour garder la fenêtre au-dessus des autres ; reclique pour la libérer. Le choix est mémorisé et vaut pour les deux modes. Désactivée par défaut.

- **Windows, macOS, Linux sous X11** — la fenêtre s'épingle elle-même.
- **WSL** — la fenêtre est affichée par Windows (WSLg) : l'appli demande à Windows de l'épingler, par `powershell.exe`. La première fois prend une à deux secondes. Si Windows refuse, l'épingle se désactive et son message dit pourquoi.
- **Wayland, hors WSL** — une appli ne peut pas s'y garder elle-même au premier plan. Demande-le à ton bureau : sous GNOME, **Alt+Espace** puis **« Toujours au premier plan »**.

## Réglages

Ouvre-les avec **⚙** dans la barre de lecture.

- **Dossier Songs** — choisis ton dossier osu! `Songs` et scanne-le. Le scan est mis en cache, et refait seulement quand le contenu du dossier change.
- **Thèmes** — Dark, Glass, Sakura, Minimal.
- **Videos** — *Hide controls while playing* : dans la sphère et la barre de lecture, les contrôles s'effacent après un moment sans bouger le pointeur, et reviennent dès qu'il bouge. *Visualizer for tracks without a video* : désactive-le pour voir l'image de fond à la place.

## Créer un thème personnalisé

Les thèmes sont définis dans `src/hooks/useTheme.ts`, sous forme d'objets de variables CSS. Pour en ajouter un, ajoute une entrée au tableau `BUILTIN_THEMES` :

```ts
{
  id: "mon-theme",
  name: "Mon Thème",
  variables: {
    "--bg-primary": "#0a0a0a",
    "--accent": "#00ff88",
    // ...voir ThemeVariables dans src/types/index.ts
  }
}
```

## Feuille de route

- [ ] Chargeur de thèmes personnalisés depuis un fichier
- [x] Mode mini widget (toujours au premier plan, compact) : le mode sphère et son épingle
- [x] Parseur de fichiers `.osu` pour l'affichage du BPM
- [x] Gestion des playlists
- [ ] File de lecture
- [ ] Raccourcis clavier globaux
- [ ] Icône dans la barre des tâches (system tray)
- [ ] Android / iOS (Tauri 2.0 mobile)
- [x] Visualiseur (spectre) pour les pistes sans vidéo
- [ ] Visualiseur de forme d'onde

## Crédits

Créé et maintenu par **Shin Aki** — projet d'origine : [github.com/ShjnAki/osu-music_player](https://github.com/ShjnAki/osu-music_player).

Si tu utilises, forkes ou partages l'appli, merci de créditer le projet d'origine avec un lien vers ce dépôt. Et si elle te plaît, une ⭐ sur le dépôt est la meilleure façon de dire merci !

## Licence

MIT — Fork-le, modifie-le, partage-le ! 🎮 Voir [LICENSE](LICENSE) : garde sa mention de copyright dans tes copies et tes forks.
