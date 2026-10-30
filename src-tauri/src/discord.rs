// src-tauri/src/discord.rs

//! Discord Rich Presence : « écoute <titre> » sur le profil de l'utilisateur.
//!
//! Par l'IPC local de Discord, sans crate : un tube nommé sous Windows, une
//! socket Unix ailleurs. Chaque trame : opcode et longueur (u32 petit-boutiste)
//! puis du JSON. Sans Discord sur la machine (ou sous WSL, où son IPC reste
//! côté Windows), rien ne s'affiche, sans erreur.

use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Sender};

/// Application Discord « osu! Player » : son nom s'affiche sur le profil.
pub const CLIENT_ID: &str = "1565740250511183997";

const OP_HANDSHAKE: u32 = 0;
const OP_FRAME: u32 = 1;
// Discord refuse les champs de moins de 2 ou de plus de 128 caractères.
const MAX_FIELD_CHARS: usize = 128;

/// Ce que l'interface demande d'afficher.
#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct Activity {
    pub title: String,
    pub artist: String,
    /// Début et fin du morceau (ms depuis l'époque Unix), pour la barre de
    /// progression de Discord ; absents en pause.
    pub start_ms: Option<u64>,
    pub end_ms: Option<u64>,
    pub paused: bool,
}

fn field(text: &str) -> String {
    let mut text: String = text.trim().chars().take(MAX_FIELD_CHARS).collect();
    // Un caractère blanc visible pour Discord, qui rejetterait un titre d'une lettre.
    while text.chars().count() < 2 {
        text.push('\u{2800}');
    }
    text
}

pub fn activity_payload(activity: Option<&Activity>, pid: u32, nonce: u64) -> Value {
    let activity = activity.map(|a| {
        let state = if a.paused { "Paused".to_string() } else { format!("by {}", a.artist.trim()) };
        let mut value = json!({
            // « Écoute » plutôt que « Joue à ».
            "type": 2,
            "details": field(&a.title),
            "state": field(&state),
            "assets": { "large_image": "logo", "large_text": "osu! Player" },
        });
        if let (Some(start), Some(end), false) = (a.start_ms, a.end_ms, a.paused) {
            value["timestamps"] = json!({ "start": start, "end": end });
        }
        value
    });
    json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": pid, "activity": activity },
        "nonce": nonce.to_string(),
    })
}

pub fn encode_frame(op: u32, payload: &Value) -> Vec<u8> {
    let body = payload.to_string().into_bytes();
    let mut frame = Vec::with_capacity(8 + body.len());
    frame.extend_from_slice(&op.to_le_bytes());
    frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
    frame.extend_from_slice(&body);
    frame
}

pub fn read_frame(stream: &mut impl Read) -> std::io::Result<(u32, Value)> {
    let mut header = [0u8; 8];
    stream.read_exact(&mut header)?;
    let op = u32::from_le_bytes([header[0], header[1], header[2], header[3]]);
    let len = u32::from_le_bytes([header[4], header[5], header[6], header[7]]) as usize;
    let mut body = vec![0u8; len];
    stream.read_exact(&mut body)?;
    let value = serde_json::from_slice(&body)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok((op, value))
}

trait Pipe: Read + Write + Send {}
impl<T: Read + Write + Send> Pipe for T {}

/// Où Discord ouvre sa socket hors Windows, installations Flatpak et Snap
/// comprises.
pub fn default_socket_dirs() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = ["XDG_RUNTIME_DIR", "TMPDIR", "TMP", "TEMP"]
        .iter()
        .filter_map(|var| std::env::var_os(var).map(PathBuf::from))
        .collect();
    roots.push(PathBuf::from("/tmp"));
    roots
        .iter()
        .flat_map(|root| [root.clone(), root.join("app/com.discordapp.Discord"), root.join("snap.discord")])
        .collect()
}

#[allow(unused_variables)]
fn connect(socket_dirs: &[PathBuf]) -> Option<Box<dyn Pipe>> {
    for i in 0..10 {
        #[cfg(windows)]
        if let Ok(pipe) = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(format!(r"\\.\pipe\discord-ipc-{i}"))
        {
            return Some(Box::new(pipe));
        }
        #[cfg(unix)]
        for dir in socket_dirs {
            if let Ok(socket) = std::os::unix::net::UnixStream::connect(dir.join(format!("discord-ipc-{i}"))) {
                return Some(Box::new(socket));
            }
        }
    }
    None
}

fn connect_and_handshake(socket_dirs: &[PathBuf]) -> Option<Box<dyn Pipe>> {
    let mut pipe = connect(socket_dirs)?;
    pipe.write_all(&encode_frame(OP_HANDSHAKE, &json!({ "v": 1, "client_id": CLIENT_ID }))).ok()?;
    // Discord répond READY, ou ferme la connexion si l'identifiant est refusé.
    match read_frame(&mut pipe) {
        Ok((OP_FRAME, _)) => Some(pipe),
        _ => None,
    }
}

/// Fil qui tient la connexion : (re)connexion à la demande, car Discord peut
/// être lancé ou relancé après l'appli, et seule la dernière demande en
/// attente est envoyée, Discord limitant le rythme des mises à jour.
pub fn spawn(socket_dirs: Vec<PathBuf>) -> Sender<Option<Activity>> {
    let (tx, rx) = channel::<Option<Activity>>();
    std::thread::spawn(move || {
        let pid = std::process::id();
        let mut pipe: Option<Box<dyn Pipe>> = None;
        let mut nonce = 0u64;
        while let Ok(mut activity) = rx.recv() {
            while let Ok(newer) = rx.try_recv() {
                activity = newer;
            }
            // Une seconde tentative si la connexion était morte (Discord relancé).
            for _ in 0..2 {
                if pipe.is_none() {
                    pipe = connect_and_handshake(&socket_dirs);
                }
                let Some(p) = pipe.as_mut() else { break };
                nonce += 1;
                let frame = encode_frame(OP_FRAME, &activity_payload(activity.as_ref(), pid, nonce));
                if p.write_all(&frame).and_then(|_| read_frame(p)).is_ok() {
                    break;
                }
                pipe = None;
            }
        }
    });
    tx
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(paused: bool) -> Activity {
        Activity {
            title: "Neon Skyline".into(),
            artist: "Kurenai Mio".into(),
            start_ms: Some(1_000),
            end_ms: Some(193_000),
            paused,
        }
    }

    #[test]
    fn activite_en_lecture_avec_barre_de_progression() {
        let payload = activity_payload(Some(&track(false)), 42, 7);
        assert_eq!(payload["cmd"], "SET_ACTIVITY");
        assert_eq!(payload["nonce"], "7");
        assert_eq!(payload["args"]["pid"], 42);
        let activity = &payload["args"]["activity"];
        assert_eq!(activity["type"], 2);
        assert_eq!(activity["details"], "Neon Skyline");
        assert_eq!(activity["state"], "by Kurenai Mio");
        assert_eq!(activity["timestamps"]["end"], 193_000);
    }

    #[test]
    fn activite_en_pause_sans_barre() {
        let payload = activity_payload(Some(&track(true)), 1, 1);
        assert_eq!(payload["args"]["activity"]["state"], "Paused");
        assert!(payload["args"]["activity"].get("timestamps").is_none());
    }

    #[test]
    fn activite_effacee() {
        assert!(activity_payload(None, 1, 1)["args"]["activity"].is_null());
    }

    #[test]
    fn champs_trop_courts_ou_trop_longs_ajustes() {
        assert_eq!(field("A").chars().count(), 2);
        assert_eq!(field(&"x".repeat(300)).chars().count(), 128);
    }

    #[test]
    fn trame_relue_a_l_identique() {
        let payload = json!({ "v": 1, "client_id": CLIENT_ID });
        let frame = encode_frame(OP_HANDSHAKE, &payload);
        assert_eq!(&frame[..4], &[0, 0, 0, 0]);
        assert_eq!(read_frame(&mut frame.as_slice()).unwrap(), (OP_HANDSHAKE, payload));
    }

    /// Faux Discord sur une socket Unix : poignée de main, READY, puis une
    /// activité reçue et acquittée.
    #[cfg(unix)]
    #[test]
    fn dialogue_avec_un_faux_discord() {
        use std::os::unix::net::UnixListener;
        let dir = std::env::temp_dir().join(format!("discord-ipc-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let listener = UnixListener::bind(dir.join("discord-ipc-0")).unwrap();
        let (seen_tx, seen_rx) = channel();
        std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let handshake = read_frame(&mut socket).unwrap();
            socket.write_all(&encode_frame(OP_FRAME, &json!({ "cmd": "DISPATCH", "evt": "READY" }))).unwrap();
            let activity = read_frame(&mut socket).unwrap();
            socket.write_all(&encode_frame(OP_FRAME, &json!({ "cmd": "SET_ACTIVITY", "nonce": "1" }))).unwrap();
            seen_tx.send((handshake, activity)).unwrap();
        });

        let tx = spawn(vec![dir.clone()]);
        tx.send(Some(track(false))).unwrap();
        let ((op0, handshake), (op1, activity)) = seen_rx.recv_timeout(std::time::Duration::from_secs(5)).unwrap();
        std::fs::remove_dir_all(&dir).ok();
        assert_eq!((op0, handshake["client_id"].as_str()), (OP_HANDSHAKE, Some(CLIENT_ID)));
        assert_eq!(op1, OP_FRAME);
        assert_eq!(activity["args"]["activity"]["details"], "Neon Skyline");
    }

    #[test]
    fn sans_discord_rien_ne_bloque() {
        let tx = spawn(vec![PathBuf::from("/nonexistent")]);
        assert!(tx.send(Some(track(false))).is_ok());
    }
}
