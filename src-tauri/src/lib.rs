#![allow(unused_imports)]

#[cfg(target_os = "linux")]
mod media_server;
mod osu_parse;

use id3::TagLike;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

const MIN_DURATION_SECS: u64 = 30;
const MAX_DURATION_SECS: u64 = 600;

/// Incrémenter invalide les caches existants. Nécessaire quand le scan produit
/// des champs que les anciens caches n'ont pas : sans ça, un cache dont la
/// mtime n'a pas bougé est resservi indéfiniment, sans les nouvelles données.
const CACHE_VERSION: u32 = 4;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub bpm: Option<f32>,
    pub duration: Option<u64>,
    pub path: String,
    pub beatmap_set: Option<String>,
    pub cover_path: Option<String>,
    pub background_path: Option<String>, // ← nouveau
    #[serde(default)]
    pub video_path: Option<String>,
    /// Instant de la musique (ms) où démarre la vidéo, pour la synchroniser.
    #[serde(default)]
    pub video_offset_ms: Option<i64>,
}

fn md5_simple(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}

/// Texte d'un tag ID3 débarrassé de ce qui ne s'affiche pas.
///
/// Certains tags ne contiennent que des caractères de contrôle (octets nuls de
/// remplissage, par exemple), des espaces ou des caractères sans largeur : non
/// vides, ils passaient pour un vrai titre, et la piste s'affichait sans nom au
/// lieu de se rabattre sur le nom du dossier.
fn clean_tag_text(text: &str) -> String {
    text.chars()
        .filter(|c| !c.is_control() && !matches!(c, '\u{200B}'..='\u{200D}' | '\u{2060}' | '\u{FEFF}'))
        .collect::<String>()
        .trim()
        .to_string()
}

fn fix_encoding(s: &str) -> String {
    if s.contains('\u{FFFD}') {
        return s.replace('\u{FFFD}', "?");
    }
    s.to_string()
}

fn parse_from_folder_name(folder_name: &str) -> (String, String) {
    let without_id = folder_name.splitn(2, ' ').nth(1).unwrap_or(folder_name);
    if let Some(sep) = without_id.find(" - ") {
        let artist = without_id[..sep].trim().to_string();
        let title = without_id[sep + 3..].trim().to_string();
        (title, artist)
    } else {
        (without_id.to_string(), "Unknown Artist".to_string())
    }
}

fn is_main_audio(path: &Path) -> bool {
    let filename = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let excluded_prefixes = [
        "normal-", "soft-", "drum-", "nightcore-",
        "spinnerspin", "spinnerbonus", "combobreak",
    ];
    let excluded_exact = [
        "failsound", "applause", "comboburst",
        "sectionpass", "sectionfail",
        "count1s", "count2s", "count3s",
        "gos", "readys", "pause-loop",
        "pause-back", "pause-retry", "pause-continue",
    ];

    !excluded_prefixes.iter().any(|p| filename.starts_with(p))
        && !excluded_exact.iter().any(|e| filename == *e)
        && filename.len() > 2
}

/// Estimation grossière de la durée à partir de la taille du fichier.
///
/// Fallback utilisé uniquement quand aucun tag ID3 exploitable n'est disponible
/// (rare sur les beatmaps osu!, qui sont presque toujours taguées).
///
/// Limitation connue : le débit est supposé fixe (~128 kbps en MP3), alors que
/// les beatmaps vont de 96 à 320 kbps. La durée calculée peut donc être
/// surestimée jusqu'à ~2,5x sur un fichier 320 kbps et sous-estimée sur du
/// 96 kbps — assez pour qu'un morceau tombe du mauvais côté du filtre
/// `duration_in_range` (30–600 s). Lire le frame header MPEG donnerait le
/// vrai bitrate si ça devient un problème.
fn estimate_duration_from_size(path: &Path, ext: &str) -> Option<u64> {
    let size = std::fs::metadata(path).ok()?.len();
    let bytes_per_sec: u64 = if ext == "mp3" { 16_000 } else { 20_000 };
    Some(size / bytes_per_sec)
}

fn duration_in_range(duration_secs: u64) -> bool {
    duration_secs >= MIN_DURATION_SECS && duration_secs <= MAX_DURATION_SECS
}

/// Emplacements où osu! range ses beatmaps sous Windows, du plus probable au moins.
fn windows_songs_candidates(local_app_data: Option<&str>, drives: &[char]) -> Vec<PathBuf> {
    // Chemins construits à la main plutôt qu'avec `join` : le séparateur de
    // `Path` suit l'OS hôte, or ces chemins doivent rester en antislash même
    // quand le code tourne ailleurs (tests sous Linux).
    let mut candidates = vec![PathBuf::from("C:\\osu!\\Songs")];
    if let Some(dir) = local_app_data {
        candidates.push(PathBuf::from(format!(
            "{}\\osu!\\Songs",
            dir.trim_end_matches('\\')
        )));
    }
    candidates.extend(
        drives
            .iter()
            .map(|letter| PathBuf::from(format!("{letter}:\\osu!\\Songs"))),
    );
    candidates
}

/// Emplacements où osu! range ses beatmaps sous Linux, du plus probable au moins.
///
/// osu! stable n'a pas de version native : il tourne sous Wine, d'où les préfixes.
/// `/mnt/c` couvre le cas WSL, où l'installation est côté Windows.
fn linux_songs_candidates(home: &str, wsl_mounts: &[PathBuf]) -> Vec<PathBuf> {
    let home = Path::new(home);
    let mut candidates = vec![
        home.join(".wine/drive_c/osu!/Songs"),
        home.join(".local/share/osu-wine/osu!/Songs"),
        home.join(".local/share/wineprefixes/osu-wine/drive_c/osu!/Songs"),
    ];
    candidates.extend(wsl_mounts.iter().map(|mount| mount.join("osu!/Songs")));
    candidates
}

/// Lettres de lecteur à tester sous Windows, et points de montage sous WSL :
/// une installation osu! n'est pas forcément sur le disque système.
fn mounted_drive_letters() -> Vec<char> {
    ('C'..='Z').collect()
}

fn wsl_mounts() -> Vec<PathBuf> {
    std::fs::read_dir("/mnt")
        .map(|entries| {
            entries
                .filter_map(|entry| entry.ok())
                .map(|entry| entry.path())
                .filter(|path| path.is_dir())
                .collect()
        })
        .unwrap_or_default()
}

/// Premier emplacement osu! existant, ou une chaîne vide si aucun n'est trouvé —
/// le front ouvre alors le sélecteur de dossier.
// `async` partout où le disque est touché : une commande Tauri synchrone tourne
// sur le fil principal, qui gère aussi la fenêtre. Pendant un scan, celle-ci
// ne recevait plus ni clics ni curseur.
#[tauri::command(async)]
fn default_songs_folder() -> String {
    let local_app_data = std::env::var("LOCALAPPDATA").ok();
    let home = std::env::var("HOME").unwrap_or_default();

    let candidates = if cfg!(target_os = "windows") {
        windows_songs_candidates(local_app_data.as_deref(), &mounted_drive_letters())
    } else {
        linux_songs_candidates(&home, &wsl_mounts())
    };

    candidates
        .into_iter()
        .find(|path| path.is_dir())
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
}

/// Formats que la webview sait lire. osu! accepte aussi .avi et .flv, mais
/// les proposer donnerait un lecteur vide.
fn is_playable_video(name: &str) -> bool {
    let name = name.to_lowercase();
    [".mp4", ".m4v", ".webm"].iter().any(|ext| name.ends_with(ext))
}

struct OsuMetadata {
    background: Option<String>,
    bpm: Option<f32>,
    video: Option<String>,
    video_offset_ms: Option<i64>,
}

/// Image de fond, BPM et vidéo d'une beatmap, lus en une seule passe sur le
/// premier `.osu` du dossier — le scan traverse des milliers de dossiers,
/// multiplier les lectures pour des informations tirées du même fichier
/// serait gratuit.
fn read_osu_metadata(folder: &Path, duration_secs: Option<u64>) -> OsuMetadata {
    // Un seul parcours du dossier pour le .osu et une éventuelle vidéo : une
    // vidéo posée dans le dossier sans être déclarée reste affichable.
    let mut osu_file = None;
    let mut loose_video = None;
    if let Ok(dir) = std::fs::read_dir(folder) {
        for entry in dir.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if osu_file.is_none() && name.ends_with(".osu") {
                osu_file = Some(entry.path());
            } else if loose_video.is_none() && is_playable_video(&name) {
                loose_video = Some(entry.path());
            }
            if osu_file.is_some() && loose_video.is_some() {
                break;
            }
        }
    }
    let loose_video = || loose_video.as_ref().map(|path| path.to_string_lossy().to_string());

    let Some(content) = osu_file.and_then(|path| std::fs::read_to_string(path).ok()) else {
        return OsuMetadata {
            background: None,
            bpm: None,
            video: loose_video(),
            video_offset_ms: loose_video().map(|_| 0),
        };
    };

    let background = osu_parse::parse_background_filename(&content)
        .map(|name| folder.join(name))
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string());

    let declared = osu_parse::parse_video(&content)
        .filter(|video| is_playable_video(&video.filename))
        .map(|video| (folder.join(&video.filename), video.offset_ms))
        .filter(|(path, _)| path.exists());
    let (video, video_offset_ms) = match declared {
        Some((path, offset)) => (Some(path.to_string_lossy().to_string()), Some(offset)),
        // Sans déclaration, aucun décalage connu : on cale la vidéo sur le
        // début de la musique.
        None => (loose_video(), loose_video().map(|_| 0)),
    };

    OsuMetadata {
        background,
        bpm: osu_parse::parse_dominant_bpm(&content, duration_secs),
        video,
        video_offset_ms,
    }
}

/// Ouvre la portée du protocole asset au dossier Songs choisi.
///
/// La portée statique de la config ne peut pas deviner où sont les beatmaps :
/// un autre disque (S:\ sous Windows), un point de montage arbitraire, ou un
/// préfixe Wine caché (`~/.wine`), que les motifs glob excluent par défaut
/// sous Unix. Les pistes s'affichaient, lues par le scan Rust, mais la webview
/// se voyait refuser les fichiers : ni son, ni fond, ni vidéo.
fn allow_songs_folder(app: &tauri::AppHandle, folder_path: &str) {
    use tauri::Manager;
    if let Err(e) = app.asset_protocol_scope().allow_directory(folder_path, true) {
        eprintln!("asset scope: {folder_path}: {e}");
    }
}

#[tauri::command(async)]
fn scan_osu_songs(app: tauri::AppHandle, folder_path: String) -> Result<Vec<Track>, String> {
    allow_songs_folder(&app, &folder_path);
    scan_songs_folder(&folder_path)
}

fn scan_songs_folder(folder_path: &str) -> Result<Vec<Track>, String> {
    let mut tracks: Vec<Track> = Vec::new();

    if !Path::new(&folder_path).exists() {
        return Err(format!("Folder not found: {}", folder_path));
    }

    for entry in WalkDir::new(&folder_path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

        if (ext == "mp3" || ext == "ogg") && is_main_audio(path) {
            let path_str = path.to_string_lossy().to_string();

            let folder_name = path
                .parent()
                .and_then(|p| p.file_name())
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let parent_dir = path.parent().unwrap_or(Path::new(""));
            let (folder_title, folder_artist) = parse_from_folder_name(&folder_name);

            let (title, artist, album, duration) = if ext == "mp3" {
                match id3::Tag::read_from_path(path) {
                    Ok(tag) => {
                        let raw_title = clean_tag_text(tag.title().unwrap_or(""));
                        let raw_artist = clean_tag_text(tag.artist().unwrap_or(""));
                        let raw_album = clean_tag_text(tag.album().unwrap_or(""));
                        let duration = tag
                            .duration()
                            .map(|d| d as u64 / 1000) // TLEN frame stores milliseconds
                            .or_else(|| estimate_duration_from_size(path, ext));

                        let title = if raw_title.is_empty() || raw_title.contains('\u{FFFD}') {
                            folder_title.clone()
                        } else {
                            fix_encoding(&raw_title)
                        };
                        let artist = if raw_artist.is_empty() || raw_artist.contains('\u{FFFD}') {
                            folder_artist.clone()
                        } else {
                            fix_encoding(&raw_artist)
                        };
                        (title, artist, fix_encoding(&raw_album), duration)
                    }
                    Err(_) => {
                        let duration = estimate_duration_from_size(path, ext);
                        (folder_title.clone(), folder_artist.clone(), "".to_string(), duration)
                    }
                }
            } else {
                let duration = estimate_duration_from_size(path, ext);
                (folder_title.clone(), folder_artist.clone(), "".to_string(), duration)
            };

            let estimated = duration.unwrap_or(0);
            if estimated > 0 && !duration_in_range(estimated) {
                continue;
            }

            // Cover (première image du dossier)
            let cover_path = std::fs::read_dir(parent_dir).ok().and_then(|mut dir| {
                dir.find_map(|e| {
                    let entry = e.ok()?;
                    let name = entry.file_name().to_string_lossy().to_lowercase();
                    if name.ends_with(".jpg") || name.ends_with(".png") {
                        Some(entry.path().to_string_lossy().to_string())
                    } else {
                        None
                    }
                })
            });

            // Fond, BPM et vidéo depuis le fichier .osu
            let metadata = read_osu_metadata(parent_dir, duration);

            let id = format!("{:x}", md5_simple(&path_str));

            tracks.push(Track {
                id,
                title,
                artist,
                album,
                bpm: metadata.bpm,
                duration,
                path: path_str,
                beatmap_set: Some(folder_name),
                cover_path,
                background_path: metadata.background,
                video_path: metadata.video,
                video_offset_ms: metadata.video_offset_ms,
            });
        }
    }

    tracks.sort_by(|a, b| a.artist.cmp(&b.artist).then(a.title.cmp(&b.title)));
    Ok(tracks)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TracksCache {
    #[serde(default)] // absent des caches écrits avant l'introduction du champ
    pub version: u32,
    pub folder_mtime: u64,
    pub tracks: Vec<Track>,
}

/// Returns the max mtime (seconds since epoch) of immediate subdirectories in folder_path.
fn folder_mtime(folder_path: &str) -> u64 {
    std::fs::read_dir(folder_path)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| e.metadata().ok())
                .filter_map(|m| m.modified().ok())
                .filter_map(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
}

#[tauri::command(async)]
fn load_tracks_cache(app: tauri::AppHandle, cache_path: String, folder_path: String) -> Option<Vec<Track>> {
    // Même avec un cache valide, sans scan : la portée doit couvrir le dossier.
    allow_songs_folder(&app, &folder_path);
    let content = std::fs::read_to_string(&cache_path).ok()?;
    let cache: TracksCache = serde_json::from_str(&content).ok()?;
    let current_mtime = folder_mtime(&folder_path);
    if cache.version == CACHE_VERSION && current_mtime == cache.folder_mtime {
        Some(cache.tracks)
    } else {
        None
    }
}

#[tauri::command(async)]
fn save_tracks_cache(cache_path: String, folder_path: String, tracks: Vec<Track>) -> Result<(), String> {
    let cache = TracksCache {
        version: CACHE_VERSION,
        folder_mtime: folder_mtime(&folder_path),
        tracks,
    };
    let json = serde_json::to_string(&cache).map_err(|e| e.to_string())?;
    // Ensure parent directory exists
    if let Some(parent) = Path::new(&cache_path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&cache_path, json).map_err(|e| e.to_string())
}

/// Taille de la fenêtre selon le mode, en pixels logiques.
///
/// Logiques et non physiques : la sphère fait 360 px CSS, et sur un écran à
/// 150 % une fenêtre de 360 px physiques n'en affiche que 240 — un quart de la
/// sphère seulement. Le mode normal reprend la taille de `tauri.conf.json`, qui
/// est elle aussi logique.
fn window_size(sphere_mode: bool) -> tauri::LogicalSize<f64> {
    if sphere_mode {
        tauri::LogicalSize { width: 360.0, height: 360.0 }
    } else {
        tauri::LogicalSize { width: 380.0, height: 580.0 }
    }
}

/// Taille minimale du mode normal, celle de `tauri.conf.json`.
fn normal_min_size() -> tauri::LogicalSize<f64> {
    tauri::LogicalSize { width: 320.0, height: 480.0 }
}

#[tauri::command]
async fn set_sphere_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;
    let win = app.get_webview_window("main").ok_or("window not found")?;
    // Le minimum de la config (480 px de haut) s'imposait aussi à la sphère :
    // la fenêtre restait haute de 480 px, et la bande vide sous le cercle
    // captait les clics destinés aux fenêtres derrière. Une sphère ne se
    // redimensionne pas non plus : l'attraper près du bord l'étirait.
    let min_size = (!enabled).then(|| tauri::Size::Logical(normal_min_size()));
    win.set_min_size(min_size).map_err(|e| e.to_string())?;
    win.set_resizable(!enabled).map_err(|e| e.to_string())?;
    // Le premier plan ne dépend plus du mode : c'est l'épingle de l'interface
    // qui le décide, dans les deux modes.
    win.set_size(tauri::Size::Logical(window_size(enabled)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Vrai si GDK ouvrira la fenêtre sous Wayland : GDK_BACKEND impose son
/// premier backend, sinon GDK essaie Wayland avant X11 dès qu'un compositeur
/// Wayland est annoncé.
fn is_wayland_session(wayland_display: Option<&str>, gdk_backend: Option<&str>) -> bool {
    let first_backend = gdk_backend
        .and_then(|b| b.split(',').next())
        .map(str::trim)
        .unwrap_or("");
    match first_backend {
        "wayland" => true,
        "" | "*" => wayland_display.is_some_and(|d| !d.is_empty()),
        _ => false,
    }
}

/// Faux quand la fenêtre ne peut pas se mettre elle-même au premier plan :
/// sous Wayland, GTK 3 ignore la demande (son set_keep_above y est vide) et le
/// protocole ne la prévoit pas. Seul le compositeur peut alors le faire, par
/// le menu de la fenêtre.
#[tauri::command]
fn always_on_top_supported() -> bool {
    !(cfg!(target_os = "linux")
        && is_wayland_session(
            std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
            std::env::var("GDK_BACKEND").ok().as_deref(),
        ))
}

/// Adresse du serveur média local, ou rien hors Linux, où asset:// suffit.
struct MediaBaseUrl(Option<String>);

#[tauri::command]
fn media_base_url(state: tauri::State<'_, MediaBaseUrl>) -> Option<String> {
    state.0.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            use tauri::Manager;
            #[cfg(target_os = "linux")]
            let base_url = {
                let handle = app.handle().clone();
                // Même liste d'autorisation que le protocole asset : le dossier
                // Songs y est ajouté au chargement du cache ou au scan.
                match media_server::MediaServer::start(move |path| {
                    handle.asset_protocol_scope().is_allowed(path)
                }) {
                    Ok(server) => Some(server.base_url),
                    Err(e) => {
                        eprintln!("serveur média : {e}");
                        None
                    }
                }
            };
            #[cfg(not(target_os = "linux"))]
            let base_url = None;
            app.manage(MediaBaseUrl(base_url));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_osu_songs,
            default_songs_folder,
            load_tracks_cache,
            save_tracks_cache,
            set_sphere_mode,
            media_base_url,
            always_on_top_supported,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn as_strings(paths: Vec<PathBuf>) -> Vec<String> {
        paths
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn windows_candidates_start_with_the_default_install_path() {
        let candidates = as_strings(windows_songs_candidates(None, &[]));
        assert_eq!(candidates.first().map(String::as_str), Some("C:\\osu!\\Songs"));
    }

    #[test]
    fn windows_candidates_include_local_app_data_install() {
        let candidates = as_strings(windows_songs_candidates(
            Some("C:\\Users\\coren\\AppData\\Local"),
            &[],
        ));
        assert!(
            candidates
                .iter()
                .any(|c| c == "C:\\Users\\coren\\AppData\\Local\\osu!\\Songs"),
            "candidats obtenus : {candidates:?}"
        );
    }

    #[test]
    fn windows_candidates_omit_local_app_data_when_unset() {
        let candidates = as_strings(windows_songs_candidates(None, &[]));
        assert!(
            candidates.iter().all(|c| !c.contains("AppData")),
            "candidats obtenus : {candidates:?}"
        );
    }

    #[test]
    fn windows_candidates_cover_installs_on_other_drives() {
        let candidates = as_strings(windows_songs_candidates(None, &['C', 'S']));
        assert!(
            candidates.contains(&"S:\\osu!\\Songs".to_string()),
            "candidats obtenus : {candidates:?}"
        );
    }

    #[test]
    fn linux_candidates_include_the_default_wine_prefix() {
        let candidates = as_strings(linux_songs_candidates("/home/shin", &[]));
        assert!(
            candidates.contains(&"/home/shin/.wine/drive_c/osu!/Songs".to_string()),
            "candidats obtenus : {candidates:?}"
        );
    }

    #[test]
    fn linux_candidates_cover_every_wsl_mount() {
        let mounts = [PathBuf::from("/mnt/c"), PathBuf::from("/mnt/s")];
        let candidates = as_strings(linux_songs_candidates("/home/shin", &mounts));
        assert!(
            candidates.contains(&"/mnt/s/osu!/Songs".to_string()),
            "candidats obtenus : {candidates:?}"
        );
    }

    #[test]
    fn tag_fait_de_caracteres_invisibles_devient_vide() {
        assert_eq!(clean_tag_text("\0\0\0"), "");
        assert_eq!(clean_tag_text("   "), "");
        assert_eq!(clean_tag_text("\u{FEFF}\u{200B}"), "");
    }

    #[test]
    fn tag_lisible_garde_son_texte_sans_le_remplissage() {
        assert_eq!(clean_tag_text("コネクト\0\0"), "コネクト");
        assert_eq!(clean_tag_text(" Magia (TV Size) "), "Magia (TV Size)");
    }

    #[test]
    fn titre_et_artiste_invisibles_remplaces_par_le_nom_du_dossier() {
        let songs = std::env::temp_dir().join(format!("osu-player-test-tags-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&songs);
        let folder = songs.join("123 ClariS - Connect");
        std::fs::create_dir_all(&folder).unwrap();
        let audio = folder.join("audio.mp3");
        std::fs::write(&audio, vec![0u8; 4096]).unwrap();
        let mut tag = id3::Tag::new();
        tag.set_title("\u{200B}  ");
        tag.set_artist("\u{FEFF}");
        tag.set_duration(120_000);
        tag.write_to_path(&audio, id3::Version::Id3v24).unwrap();

        let tracks = scan_songs_folder(songs.to_str().unwrap()).unwrap();
        assert_eq!(tracks.len(), 1);
        assert_eq!((tracks[0].title.as_str(), tracks[0].artist.as_str()), ("Connect", "ClariS"));
    }

    /// Dossier de beatmap jetable : chaque test a le sien, les tests tournant
    /// en parallèle.
    fn beatmap_folder(name: &str, files: &[(&str, &str)]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("osu-player-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        for (file, content) in files {
            std::fs::write(dir.join(file), content).unwrap();
        }
        dir
    }

    #[test]
    fn video_declaree_dans_le_osu_avec_son_decalage() {
        let dir = beatmap_folder("declaree", &[
            ("map.osu", "[Events]\nVideo,-750,\"clip.mp4\"\n"),
            ("clip.mp4", ""),
        ]);
        let metadata = read_osu_metadata(&dir, None);
        assert_eq!(metadata.video, Some(dir.join("clip.mp4").to_string_lossy().to_string()));
        assert_eq!(metadata.video_offset_ms, Some(-750));
    }

    #[test]
    fn video_posee_dans_le_dossier_sans_declaration() {
        let dir = beatmap_folder("posee", &[
            ("map.osu", "[Events]\n0,0,\"bg.jpg\",0,0\n"),
            ("Video.MP4", ""),
        ]);
        let metadata = read_osu_metadata(&dir, None);
        assert_eq!(metadata.video, Some(dir.join("Video.MP4").to_string_lossy().to_string()));
        assert_eq!(metadata.video_offset_ms, Some(0));
    }

    #[test]
    fn video_avi_declaree_ignoree_car_illisible_par_la_webview() {
        let dir = beatmap_folder("avi", &[
            ("map.osu", "[Events]\nVideo,0,\"clip.avi\"\n"),
            ("clip.avi", ""),
        ]);
        let metadata = read_osu_metadata(&dir, None);
        assert_eq!(metadata.video, None);
        assert_eq!(metadata.video_offset_ms, None);
    }

    #[test]
    fn video_declaree_mais_absente_du_disque_ignoree() {
        let dir = beatmap_folder("absente", &[("map.osu", "[Events]\nVideo,0,\"clip.mp4\"\n")]);
        assert_eq!(read_osu_metadata(&dir, None).video, None);
    }

    #[test]
    fn mode_sphere_fenetre_carree_a_la_taille_css_de_la_sphere() {
        let size = window_size(true);
        assert_eq!((size.width, size.height), (360.0, 360.0));
    }

    #[test]
    fn mode_normal_restaure_la_taille_de_la_config() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let window = &conf["app"]["windows"][0];
        let size = window_size(false);
        assert_eq!(Some(size.width), window["width"].as_f64());
        assert_eq!(Some(size.height), window["height"].as_f64());
    }

    #[test]
    fn taille_minimale_retablie_identique_a_la_config() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let window = &conf["app"]["windows"][0];
        let size = normal_min_size();
        assert_eq!(Some(size.width), window["minWidth"].as_f64());
        assert_eq!(Some(size.height), window["minHeight"].as_f64());
    }

    #[test]
    fn wayland_des_qu_un_compositeur_wayland_est_annonce() {
        assert!(is_wayland_session(Some("wayland-0"), None));
        assert!(is_wayland_session(Some("wayland-0"), Some("*")));
    }

    #[test]
    fn x11_sans_compositeur_wayland() {
        assert!(!is_wayland_session(None, None));
        assert!(!is_wayland_session(Some(""), None));
    }

    #[test]
    fn gdk_backend_impose_son_premier_backend() {
        assert!(!is_wayland_session(Some("wayland-0"), Some("x11")));
        assert!(!is_wayland_session(Some("wayland-0"), Some("x11,wayland")));
        assert!(is_wayland_session(None, Some("wayland,x11")));
    }

    #[test]
    fn linux_candidates_are_all_absolute() {
        let candidates = linux_songs_candidates("/home/shin", &[PathBuf::from("/mnt/c")]);
        assert!(!candidates.is_empty());
        assert!(candidates.iter().all(|p| p.is_absolute()));
    }
}
