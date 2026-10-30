# Suivi du chantier

Point d'étape pour reprendre le travail dans une autre session. Mis à jour au
fil des livraisons.

## Règles du dépôt (rappel)

- Commits, commentaires et noms de tests en français ; identifiants en
  anglais. Format « <périmètre> : <ce que fait le commit> ». Aucune ligne
  d'attribution.
- Un commit par état vérifiable. Un commentaire dit pourquoi, jamais quoi.
  Chaque nouveau fichier de code porte son chemin en commentaire d'en-tête.
- Ne supprimer aucun fichier, composant ou règle CSS sans validation.
- Pas de dépendance lourde.
- Vérification : `npm ci`, `node node_modules/typescript/bin/tsc --noEmit`,
  `cd src-tauri && cargo test --lib`.
- Livraison : branche `claude/loading-time-sphere-mode-jf189m`, repartie de
  `origin/main` à chaque lot, `git push origin <branche>`, PR avec la commande
  à lancer dans la description, puis merge.

## Contexte utilisateur

- Lance l'appli sous WSL (Debian, WSLg) ; dossier Songs sur `S:\osu!\Songs`
  (~7000 pistes). Veut aussi pouvoir lancer l'appli sous Windows directement.
- Thème préféré : Sakura.

## Livré

- Lecture native `<audio>`, serveur média HTTP sous Linux, préchargement.
- Vidéos des beatmaps, grande zone quand la liste est masquée.
- Visualiseur sur copie silencieuse (le son entendu ne passe jamais par
  Web Audio).
- Contrôles en icônes SVG, durées lisibles, contrôles qui s'effacent sur
  toute piste avec l'image de fond nette.
- Épingle au premier plan : native, par Windows sous WSL (PowerShell), message
  sous Wayland.
- README à jour, captures dans `docs/`.
- Doublons masqués (option « Hide duplicates », activée par défaut).
- Démarrage au point d'aperçu (option « Start at the preview point »,
  désactivée par défaut ; `CACHE_VERSION` passé à 5, d'où un rescan).
- Import des collections osu! stable (`collection.db`) en playlists, bouton
  « Import osu! collections » de l'onglet Playlists ; réimporter met à jour
  les playlists du même nom.
- Discord Rich Presence (option désactivée par défaut, Windows ou Linux natif,
  pas sous WSL), dans la 0.3.0.
- Version 0.3.0 (CHANGELOG, README) publiée : `.msi`/`.exe` Windows,
  `.AppImage`/`.deb`/`.rpm` Linux. Les prochains tags publient leur release
  directement ; `publish-release.yml` publie un brouillon resté en plan.
  Testé sous Windows par l'utilisateur : Discord et l'épingle fonctionnent.

## En attente de l'utilisateur

- Pousser le tag `v0.3.2` (vidéo découpée en cercle dans la sphère sous
  Windows, titre dans le statut Discord) : `git fetch origin && git tag v0.3.2
  origin/main && git push origin v0.3.2`.
- Dire quel nom donner à l'appli : l'application Discord s'appelle « Osu! Media
  Player », la fenêtre « osu! Player », le produit installé `osu-player`.

## Pistes pour plus tard

Titres lus dans les `.osu` (`TitleUnicode`, source, tags dans la recherche),
raccourcis clavier et touches multimédia (Media Session), file de lecture,
tri de la liste, historique, volume homogène, fondu enchaîné, taille de la
sphère, icône dans la barre des tâches.
