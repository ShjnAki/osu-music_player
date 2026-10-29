//! Parsing des fichiers `.osu`, sans dépendance ni accès disque.
//!
//! Volontairement isolé du reste du crate : ces fonctions ne manipulent que des
//! `&str`, donc `rustc --test src/osu_parse.rs` les teste sans compiler Tauri.

/// BPM dominant d'une beatmap : celui du segment de timing qui dure le plus longtemps.
///
/// Seuls les timing points non hérités comptent. Le format `.osu` les distingue par
/// une colonne `uninherited` absente des versions anciennes du format, d'où le test
/// sur `beat_length > 0` : les points hérités (verts) portent une valeur négative,
/// qui encode un multiplicateur de vitesse de slider et non un tempo.
pub fn parse_dominant_bpm(content: &str, duration_secs: Option<u64>) -> Option<f32> {
    let mut points: Vec<(f64, f64)> = Vec::new(); // (temps en ms, BPM)
    let mut in_section = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "[TimingPoints]" {
            in_section = true;
            continue;
        }
        if in_section && trimmed.starts_with('[') {
            break;
        }
        if !in_section || trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        let mut fields = trimmed.split(',');
        let (Some(time_str), Some(beat_str)) = (fields.next(), fields.next()) else {
            continue;
        };
        let (Ok(time), Ok(beat_length)) = (
            time_str.trim().parse::<f64>(),
            beat_str.trim().parse::<f64>(),
        ) else {
            continue;
        };
        if beat_length <= 0.0 {
            continue;
        }
        points.push((time, 60_000.0 / beat_length));
    }

    if points.is_empty() {
        return None;
    }
    points.sort_by(|a, b| a.0.total_cmp(&b.0));

    let mut durations: Vec<f64> = points
        .windows(2)
        .map(|w| (w[1].0 - w[0].0).max(0.0))
        .collect();

    let last_start = points[points.len() - 1].0;
    durations.push(match duration_secs {
        Some(secs) => (secs as f64 * 1000.0 - last_start).max(0.0),
        // Durée inconnue : poids neutre plutôt que zéro, qui écraserait
        // silencieusement un dernier segment potentiellement dominant.
        None if durations.is_empty() => 0.0,
        None => durations.iter().sum::<f64>() / durations.len() as f64,
    });

    // Un Vec et non une HashMap : l'ordre d'itération doit rester déterministe
    // pour que les égalités se départagent toujours sur le premier segment vu.
    let mut weighted: Vec<(i64, f64, f64)> = Vec::new(); // (clé BPM, poids, BPM)
    for (&(_, bpm), &segment) in points.iter().zip(durations.iter()) {
        let key = (bpm * 100.0).round() as i64;
        match weighted.iter_mut().find(|(k, _, _)| *k == key) {
            Some((_, weight, _)) => *weight += segment,
            None => weighted.push((key, segment, bpm)),
        }
    }

    weighted
        .into_iter()
        .reduce(|best, current| if current.1 > best.1 { current } else { best })
        .map(|(_, _, bpm)| bpm as f32)
}

/// Nom du fichier de fond déclaré dans la section `[Events]`.
///
/// Renvoie le nom tel qu'écrit dans la beatmap ; c'est à l'appelant de le
/// résoudre sur le disque.
pub fn parse_background_filename(content: &str) -> Option<String> {
    let mut in_events = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "[Events]" {
            in_events = true;
            continue;
        }
        if in_events && trimmed.starts_with('[') {
            break;
        }
        if !in_events {
            continue;
        }

        // Format : 0,0,"fond.jpg",0,0  ou  Background,0,"fond.jpg",0,0
        if trimmed.starts_with("0,0,") || trimmed.to_lowercase().starts_with("background,") {
            let start = match trimmed.find('"') {
                Some(i) => i + 1,
                None => continue,
            };
            if let Some(end) = trimmed[start..].find('"') {
                return Some(trimmed[start..start + end].to_string());
            }
        }
    }

    None
}

/// Vidéo déclarée dans la section `[Events]`.
#[derive(Debug, PartialEq)]
pub struct VideoEvent {
    pub filename: String,
    /// Instant de la musique, en millisecondes, où la vidéo démarre : négatif
    /// quand elle commence avant l'audio.
    pub offset_ms: i64,
}

/// Vidéo d'une beatmap : `Video,-500,"clip.mp4"` ou sa forme numérique
/// `1,-500,"clip.mp4"`.
pub fn parse_video(content: &str) -> Option<VideoEvent> {
    let mut in_events = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "[Events]" {
            in_events = true;
            continue;
        }
        if in_events && trimmed.starts_with('[') {
            break;
        }
        if !in_events {
            continue;
        }

        let mut fields = trimmed.splitn(3, ',');
        let (Some(kind), Some(offset), Some(rest)) = (fields.next(), fields.next(), fields.next())
        else {
            continue;
        };
        if !(kind.eq_ignore_ascii_case("video") || kind == "1") {
            continue;
        }
        let Ok(offset_ms) = offset.trim().parse::<i64>() else {
            continue;
        };
        let rest = rest.trim();
        let filename = match rest.strip_prefix('"') {
            Some(quoted) => quoted.split('"').next().unwrap_or(""),
            // Les guillemets sont facultatifs dans les vieilles beatmaps.
            None => rest.split(',').next().unwrap_or(""),
        };
        if !filename.is_empty() {
            return Some(VideoEvent {
                filename: filename.to_string(),
                offset_ms,
            });
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_bpm(actual: Option<f32>, expected: f32) {
        let value = actual.expect("un BPM était attendu");
        assert!(
            (value - expected).abs() < 0.01,
            "BPM attendu {expected}, obtenu {value}"
        );
    }

    #[test]
    fn single_timing_point_gives_its_bpm() {
        let content = "\
osu file format v14

[TimingPoints]
0,333.333333333333,4,2,1,60,1,0

[HitObjects]
256,192,1000,1,0,0:0:0:0:
";
        assert_bpm(parse_dominant_bpm(content, Some(120)), 180.0);
    }

    #[test]
    fn inherited_timing_points_are_ignored() {
        let content = "\
[TimingPoints]
0,400,4,2,1,60,1,0
5000,-50,4,2,1,60,0,0
9000,-200,4,2,1,60,0,0
";
        assert_bpm(parse_dominant_bpm(content, Some(120)), 150.0);
    }

    #[test]
    fn dominant_bpm_wins_over_slow_intro() {
        let content = "\
[TimingPoints]
0,666.666666666667,4,2,1,60,1,0
20000,342.857142857143,4,2,1,60,1,0
";
        assert_bpm(parse_dominant_bpm(content, Some(200)), 175.0);
    }

    #[test]
    fn last_segment_gets_neutral_weight_when_duration_unknown() {
        let content = "\
[TimingPoints]
0,666.666666666667,4,2,1,60,1,0
10000,342.857142857143,4,2,1,60,1,0
60000,300,4,2,1,60,1,0
";
        assert_bpm(parse_dominant_bpm(content, None), 175.0);
    }

    #[test]
    fn break_periods_in_events_are_not_read_as_timing_points() {
        let content = "\
[Events]
//Background and Video events
0,0,\"bg.jpg\",0,0
//Break Periods
2,100,300

[HitObjects]
256,192,1000,1,0,0:0:0:0:
";
        assert_eq!(parse_dominant_bpm(content, Some(120)), None);
    }

    #[test]
    fn missing_timing_points_section_returns_none() {
        let content = "\
osu file format v14

[General]
AudioFilename: audio.mp3
";
        assert_eq!(parse_dominant_bpm(content, Some(120)), None);
    }

    #[test]
    fn old_format_timing_points_without_uninherited_column_are_read() {
        let content = "\
osu file format v4

[TimingPoints]
1000,500
";
        assert_bpm(parse_dominant_bpm(content, Some(120)), 120.0);
    }

    #[test]
    fn background_filename_is_read_from_events() {
        let content = "\
[Events]
//Background and Video events
0,0,\"bg.jpg\",0,0
//Break Periods
2,100,300
";
        assert_eq!(
            parse_background_filename(content),
            Some("bg.jpg".to_string())
        );
    }

    #[test]
    fn background_keyword_form_is_supported() {
        let content = "\
[Events]
Background,0,\"cover.png\",0,0
";
        assert_eq!(
            parse_background_filename(content),
            Some("cover.png".to_string())
        );
    }

    #[test]
    fn video_events_are_not_mistaken_for_background() {
        let content = "\
[Events]
Video,-500,\"intro.mp4\"
1,0,\"clip.avi\"
0,0,\"real-bg.jpg\",0,0
";
        assert_eq!(
            parse_background_filename(content),
            Some("real-bg.jpg".to_string())
        );
    }

    #[test]
    fn video_declaree_par_son_nom_avec_decalage_negatif() {
        let content = "\
[Events]
0,0,\"bg.jpg\",0,0
Video,-500,\"intro.mp4\"
";
        assert_eq!(
            parse_video(content),
            Some(VideoEvent { filename: "intro.mp4".to_string(), offset_ms: -500 })
        );
    }

    #[test]
    fn video_declaree_sous_forme_numerique() {
        let content = "\
[Events]
1,1200,\"clip.mp4\"
";
        assert_eq!(
            parse_video(content),
            Some(VideoEvent { filename: "clip.mp4".to_string(), offset_ms: 1200 })
        );
    }

    #[test]
    fn video_sans_guillemets_des_vieilles_beatmaps() {
        let content = "\
[Events]
Video,0,clip.mp4
";
        assert_eq!(
            parse_video(content).map(|v| v.filename),
            Some("clip.mp4".to_string())
        );
    }

    #[test]
    fn fond_et_storyboard_ne_sont_pas_pris_pour_une_video() {
        let content = "\
[Events]
0,0,\"bg.jpg\",0,0
Sprite,Foreground,Centre,\"sb/star.png\",320,240
";
        assert_eq!(parse_video(content), None);
    }

    #[test]
    fn pas_de_video_hors_de_la_section_events() {
        let content = "\
[Events]
0,0,\"bg.jpg\",0,0

[HitObjects]
1,0,\"pas-une-video.mp4\"
";
        assert_eq!(parse_video(content), None);
    }

    #[test]
    fn events_outside_the_section_are_not_read() {
        let content = "\
[Events]
//Background and Video events

[TimingPoints]
0,333.333333333333,4,2,1,60,1,0

[HitObjects]
0,0,\"pas-un-fond.jpg\",0,0
";
        assert_eq!(parse_background_filename(content), None);
    }

    #[test]
    fn missing_events_section_returns_none() {
        let content = "\
[General]
AudioFilename: audio.mp3
";
        assert_eq!(parse_background_filename(content), None);
    }
}
