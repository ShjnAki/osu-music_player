# AUDIT.md — osu! Player

État du code à la date du 2026-05-27, avant toute modification.

---

## Points propres

- **Séparation claire Rust / React** : le backend gère tout l'I/O (scan, lecture de tags, parsing .osu) ; le frontend ne touche jamais le filesystem directement.
- **Zustand bien utilisé** : store unique, `persist` middleware avec `partialize` ciblé (volume, thème, dossier).
- **useAudio propre** : cycle de vie Howler bien géré (unload à chaque changement de piste, cleanup sur unmount).
- **Theming via CSS custom properties** : les 4 thèmes sont des objets JSON, appliqués via `document.documentElement.style.setProperty` — facile à étendre.
- **Filtrage des hitsounds** : `is_main_audio()` en Rust exclut correctement les hitsounds osu! par préfixe/nom exact.
- **Fallback métadonnées** : si les tags ID3 sont absents ou corrompus, on parse le nom du dossier (`"<id> Artist - Title"`).
- **Background depuis le .osu** : parsing de la section `[Events]` pour extraire l'image de fond — bien pensé.

---

## Dettes techniques

### Rust (`src-tauri/src/lib.rs`)

**Bug sérieux — durée ID3 en millisecondes traitée comme secondes**
Le frame TLEN de l'ID3v2 stocke la durée en **millisecondes**. Le code fait `tag.duration().map(|d| d as u64)` puis applique `duration_in_range(30..=600)`. Un track de 3 min a un TLEN = 180 000 → échoue le filtre → **track ignoré**. En pratique beaucoup de beatmaps n'ont pas de TLEN, donc ça passe inaperçu, mais c'est un bug latent.

```rust
// Actuel (bugué si TLEN présent)
let duration = tag.duration().map(|d| d as u64);

// Correct
let duration = tag.duration().map(|d| d as u64 / 1000);
```

**Commandes Tauri inutilisées**
- `parse_osu_bpm` : enregistrée, jamais appelée depuis le frontend. BPM est toujours `None` dans l'UI.
- `read_audio_file` : idem, Howler utilise le protocole `asset://` directement.

**Estimation de durée très approximative**
`estimate_duration_from_size` utilise 16 000 bytes/s pour MP3 (= ~128 kbps). Les beatmaps osu! varient de 96 à 320 kbps — l'erreur peut dépasser ×2.

**Pas de cache**
Chaque lancement rescanne intégralement le dossier Songs. Sur 6 700+ tracks, c'est lent et inutile si rien n'a changé.

### React / TypeScript

**API Tauri v1 dans le code**
```tsx
// App.tsx ligne 45 — API Tauri v1, dépréciée en v2
(window as any).__TAURI__?.window?.appWindow?.close()

// Correct Tauri v2
import { getCurrentWindow } from '@tauri-apps/api/window';
getCurrentWindow().close();
```

**Bouton minimize non fonctionnel**
```tsx
<button className="titlebar-btn" onClick={() => {}}>—</button>
```

**`filteredTracks` est un état dérivé stocké dans le store**
`Library.tsx` recalcule `filtered` via `useMemo`, puis le pousse dans le store via `useEffect`. C'est du state dérivé qui n'a pas à vivre dans Zustand — n'importe quel composant futur qui veut la liste filtrée doit passer par le store plutôt que de recalculer lui-même.

**Accent hardcodé dans le CSS**
```css
/* Settings.css — ignore le thème actif */
.nav-btn.active { background: rgba(255,102,170,0.1); }
```
Devrait utiliser `rgba(var(--accent-rgb), 0.1)` ou une variable dédiée.

**Variables CSS dupliquées**
Les valeurs du thème `default` sont définies deux fois : dans `:root` de `globals.css` et dans `BUILTIN_THEMES[0]` de `useTheme.ts`. Elles peuvent diverger silencieusement.

**Pas de feedback utilisateur si le scan échoue**
```tsx
catch (e) { console.warn('Scan failed:', e); }
```
L'utilisateur ne voit rien.

### Configuration / Infrastructure

**Chemin de dev hardcodé dans `tauri.conf.json`**
```json
"scope": ["S:\\**", "C:\\**", "$HOME\\**"]
```
`S:\\**` est un disque personnel (probable lecteur réseau ou second disque du développeur). À retirer avant tout push.

**`*.Zone.Identifier` non ignorés**
Le projet tourne sous WSL2 — des centaines de fichiers `*.Zone.Identifier` existent dans le repo (métadonnées Windows). Le `.gitignore` actuel ne les exclut pas.

**Favicon Vite par défaut**
`index.html` pointe encore sur `/vite.svg` — le projet a son propre icon (`app-icon.png`).

**`dist/` contient des fichiers compilés**
Le dossier `dist/` existe localement avec des assets compilés. `.gitignore` l'exclut correctement, mais sa présence locale peut prêter à confusion.

---

## Bugs évidents

| Fichier | Ligne | Problème |
|---|---|---|
| `lib.rs` | ~169 | Durée ID3 en ms traitée comme secondes → tracks avec TLEN filtrés |
| `App.tsx` | 45 | API Tauri v1 pour fermer la fenêtre |
| `App.tsx` | 44 | Bouton minimize vide (`onClick={() => {}`) |
| `tauri.conf.json` | 32 | `S:\\**` chemin dev personnel dans le scope asset |
| `PlayerBar.css` | 132 | Couleur accent hardcodée, insensible au thème |

---

## Résumé priorités

1. **Avant le push GitHub** : retirer `S:\\**` de `tauri.conf.json`, ajouter `*.Zone.Identifier` au `.gitignore`
2. **Court terme** : corriger le bug durée ID3, fixer l'API Tauri v2 pour close/minimize
3. **Moyen terme** : système de cache des métadonnées, supprimer les commandes Tauri inutilisées ou les brancher
4. **Refacto** : sortir `filteredTracks` du store Zustand, éliminer la duplication des variables CSS
