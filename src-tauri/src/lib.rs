#![allow(unused_imports)]

mod osu_parse;

use id3::TagLike;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

const MIN_DURATION_SECS: u64 = 30;
const MAX_DURATION_SECS: u64 = 600;

/// Incrémenter invalide les caches existants. Nécessaire quand le scan produit
/// des champs que les anciens caches n'ont pas : sans ça, un cache dont la
/// mtime n'a pas bougé est resservi indéfiniment, sans les nouvelles données.
const CACHE_VERSION: u32 = 2;

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
}

fn md5_simple(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
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

/// Image de fond et BPM d'une beatmap, lus en une seule passe sur le premier
/// `.osu` du dossier — le scan traverse des milliers de dossiers, doubler les
/// lectures pour deux informations tirées du même fichier serait gratuit.
fn read_osu_metadata(folder: &Path, duration_secs: Option<u64>) -> (Option<String>, Option<f32>) {
    let osu_file = std::fs::read_dir(folder).ok().and_then(|mut dir| {
        dir.find_map(|e| {
            let entry = e.ok()?;
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if name.ends_with(".osu") {
                Some(entry.path())
            } else {
                None
            }
        })
    });

    let Some(content) = osu_file.and_then(|path| std::fs::read_to_string(path).ok()) else {
        return (None, None);
    };

    let background = osu_parse::parse_background_filename(&content)
        .map(|name| folder.join(name))
        .filter(|path| path.exists())
        .map(|path| path.to_string_lossy().to_string());

    (
        background,
        osu_parse::parse_dominant_bpm(&content, duration_secs),
    )
}

#[tauri::command]
fn scan_osu_songs(folder_path: String) -> Result<Vec<Track>, String> {
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
                        let raw_title = tag.title().unwrap_or("").to_string();
                        let raw_artist = tag.artist().unwrap_or("").to_string();
                        let raw_album = tag.album().unwrap_or("").to_string();
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

            // Fond et BPM depuis le fichier .osu
            let (background_path, bpm) = read_osu_metadata(parent_dir, duration);

            let id = format!("{:x}", md5_simple(&path_str));

            tracks.push(Track {
                id,
                title,
                artist,
                album,
                bpm,
                duration,
                path: path_str,
                beatmap_set: Some(folder_name),
                cover_path,
                background_path,
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

#[tauri::command]
fn load_tracks_cache(cache_path: String, folder_path: String) -> Option<Vec<Track>> {
    let content = std::fs::read_to_string(&cache_path).ok()?;
    let cache: TracksCache = serde_json::from_str(&content).ok()?;
    let current_mtime = folder_mtime(&folder_path);
    if cache.version == CACHE_VERSION && current_mtime == cache.folder_mtime {
        Some(cache.tracks)
    } else {
        None
    }
}

#[tauri::command]
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

#[tauri::command]
async fn set_sphere_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri::Manager;
    let win = app.get_webview_window("main").ok_or("window not found")?;
    if enabled {
        win.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 360, height: 360 }))
            .map_err(|e| e.to_string())?;
        win.set_always_on_top(true).map_err(|e| e.to_string())?;
    } else {
        win.set_size(tauri::Size::Physical(tauri::PhysicalSize { width: 380, height: 580 }))
            .map_err(|e| e.to_string())?;
        win.set_always_on_top(false).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_osu_songs,
            load_tracks_cache,
            save_tracks_cache,
            set_sphere_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
