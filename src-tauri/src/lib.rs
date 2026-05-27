#![allow(unused_imports)]

use id3::TagLike;
use serde::{Deserialize, Serialize};
use std::path::Path;
use walkdir::WalkDir;

const MIN_DURATION_SECS: u64 = 30;
const MAX_DURATION_SECS: u64 = 600;

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

fn estimate_duration_from_size(path: &Path, ext: &str) -> Option<u64> {
    let size = std::fs::metadata(path).ok()?.len();
    let bytes_per_sec: u64 = if ext == "mp3" { 16_000 } else { 20_000 };
    Some(size / bytes_per_sec)
}

fn duration_in_range(duration_secs: u64) -> bool {
    duration_secs >= MIN_DURATION_SECS && duration_secs <= MAX_DURATION_SECS
}

/// Parse le fichier .osu pour trouver l'image de fond dans la section [Events]
/// Ligne typique: 0,0,"bg.jpg",0,0  ou  Background,0,"bg.jpg",0,0
fn get_background_from_osu(folder: &Path) -> Option<String> {
    // Trouve le premier fichier .osu dans le dossier
    let osu_file = std::fs::read_dir(folder).ok()?.find_map(|e| {
        let entry = e.ok()?;
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.ends_with(".osu") {
            Some(entry.path())
        } else {
            None
        }
    })?;

    let content = std::fs::read_to_string(&osu_file).ok()?;

    let mut in_events = false;
    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "[Events]" {
            in_events = true;
            continue;
        }
        // Quitter la section Events si on atteint une autre section
        if in_events && trimmed.starts_with('[') {
            break;
        }

        if in_events {
            // Format: 0,0,"filename.jpg",0,0
            // ou:     Background,0,"filename.jpg",0,0
            if trimmed.starts_with("0,0,") || trimmed.to_lowercase().starts_with("background,") {
                // Extraire le nom du fichier entre guillemets
                if let Some(start) = trimmed.find('"') {
                    if let Some(end) = trimmed[start + 1..].find('"') {
                        let img_name = &trimmed[start + 1..start + 1 + end];
                        let img_path = folder.join(img_name);
                        if img_path.exists() {
                            return Some(img_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    None
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

            // Background depuis le fichier .osu
            let background_path = get_background_from_osu(parent_dir);

            let id = format!("{:x}", md5_simple(&path_str));

            tracks.push(Track {
                id,
                title,
                artist,
                album,
                bpm: None,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![scan_osu_songs])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}