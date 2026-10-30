// src-tauri/src/media_server.rs
//! Serveur HTTP local qui sert musiques et vidéos à la webview, sous Linux.
//!
//! WebKitGTK ne lit pas un `<audio>` ou un `<video>` servi par `asset://`
//! (erreur 4), et lit de travers certains mp3 chargés en blob : un mp3 CBR
//! sans en-tête Xing y démarre au milieu du morceau. Servis en HTTP avec
//! requêtes partielles, les mêmes fichiers sont lus correctement, en flux.
//!
//! N'importe quel processus local peut joindre un port de 127.0.0.1, et une
//! page web aussi, par « DNS rebinding ». D'où trois verrous : un jeton
//! aléatoire dans chaque URL, un en-tête `Host` exigé à l'identique, et la
//! même liste d'autorisation que le protocole asset (le dossier Songs).

use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

/// Taille maximale de l'en-tête d'une requête : un lecteur multimédia n'envoie
/// que quelques lignes, au-delà c'est autre chose qu'un lecteur.
const MAX_HEAD_BYTES: usize = 16 * 1024;

pub struct MediaServer {
    /// `http://127.0.0.1:<port>/<jeton>` ; le chemin du fichier, encodé, suit.
    pub base_url: String,
}

impl MediaServer {
    pub fn start<F>(is_allowed: F) -> io::Result<MediaServer>
    where
        F: Fn(&Path) -> bool + Send + Sync + 'static,
    {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        let token = random_token()?;
        let base_url = format!("http://127.0.0.1:{port}/{token}");

        let config = Arc::new(Config {
            host: format!("127.0.0.1:{port}"),
            prefix: format!("/{token}/"),
            is_allowed: Box::new(is_allowed),
        });
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let config = Arc::clone(&config);
                // Un fil par connexion : un lecteur n'en ouvre que quelques-unes,
                // et un fichier lent à lire ne doit pas bloquer les autres.
                std::thread::spawn(move || {
                    // Un client qui coupe la connexion en cours de lecture
                    // (saut dans le morceau, piste quittée) n'a rien d'anormal.
                    let _ = handle(stream, &config);
                });
            }
        });

        Ok(MediaServer { base_url })
    }
}

struct Config {
    host: String,
    prefix: String,
    is_allowed: Box<dyn Fn(&Path) -> bool + Send + Sync>,
}

fn random_token() -> io::Result<String> {
    let mut bytes = [0u8; 16];
    std::fs::File::open("/dev/urandom")?.read_exact(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

struct Request {
    method: String,
    target: String,
    host: Option<String>,
    range: Option<String>,
}

fn read_request(stream: &mut TcpStream) -> io::Result<Request> {
    let mut reader = BufReader::new(stream.take(MAX_HEAD_BYTES as u64));
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let mut parts = line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let target = parts.next().unwrap_or_default().to_string();

    let (mut host, mut range) = (None, None);
    loop {
        line.clear();
        if reader.read_line(&mut line)? == 0 || line.trim().is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            let value = value.trim().to_string();
            match name.trim().to_ascii_lowercase().as_str() {
                "host" => host = Some(value),
                "range" => range = Some(value),
                _ => {}
            }
        }
    }
    Ok(Request { method, target, host, range })
}

fn handle(mut stream: TcpStream, config: &Config) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(10)))?;
    let request = read_request(&mut stream)?;

    if request.method != "GET" && request.method != "HEAD" {
        return respond_status(&mut stream, "405 Method Not Allowed");
    }
    if request.host.as_deref() != Some(config.host.as_str()) {
        return respond_status(&mut stream, "403 Forbidden");
    }
    let Some(path) = resolve_target(&request.target, &config.prefix) else {
        return respond_status(&mut stream, "404 Not Found");
    };
    if !(config.is_allowed)(&path) {
        return respond_status(&mut stream, "403 Forbidden");
    }
    let Ok(mut file) = std::fs::File::open(&path) else {
        return respond_status(&mut stream, "404 Not Found");
    };
    let size = file.metadata()?.len();

    let (status, start, end) = match request.range.as_deref().map(|r| parse_range(r, size)) {
        None => ("200 OK", 0, size.saturating_sub(1)),
        Some(Some((start, end))) => ("206 Partial Content", start, end),
        Some(None) => {
            let head = format!(
                "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{size}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            );
            return stream.write_all(head.as_bytes());
        }
    };
    let length = if size == 0 { 0 } else { end - start + 1 };

    // CORS ouvert : le visualiseur analyse le son par Web Audio, qui ne reçoit
    // que du silence d'une source d'une autre origine sans cet en-tête. L'accès
    // reste fermé par le jeton et l'en-tête Host, pas par l'origine.
    let mut head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {length}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n",
        content_type(&path)
    );
    if status.starts_with("206") {
        head.push_str(&format!("Content-Range: bytes {start}-{end}/{size}\r\n"));
    }
    head.push_str("\r\n");
    stream.write_all(head.as_bytes())?;

    if request.method == "GET" && length > 0 {
        file.seek(SeekFrom::Start(start))?;
        io::copy(&mut file.take(length), &mut stream)?;
    }
    stream.flush()
}

fn respond_status(stream: &mut TcpStream, status: &str) -> io::Result<()> {
    let head = format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    stream.write_all(head.as_bytes())
}

/// Chemin du fichier demandé, si l'URL porte le bon jeton.
fn resolve_target(target: &str, prefix: &str) -> Option<PathBuf> {
    let encoded = target.strip_prefix(prefix)?;
    let decoded = percent_encoding::percent_decode_str(encoded).decode_utf8().ok()?;
    let path = PathBuf::from(decoded.as_ref());
    path.is_absolute().then_some(path)
}

/// Plage d'octets demandée, bornes incluses, ou `None` si elle sort du fichier.
fn parse_range(header: &str, size: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?;
    // Plusieurs plages dans une requête : aucun lecteur ne le fait, refusé.
    if spec.contains(',') || size == 0 {
        return None;
    }
    let (start, end) = spec.split_once('-')?;
    let (start, end) = match (start.trim(), end.trim()) {
        ("", suffix) => {
            let suffix: u64 = suffix.parse().ok()?;
            (size.saturating_sub(suffix), size - 1)
        }
        (start, "") => (start.parse().ok()?, size - 1),
        (start, end) => (start.parse().ok()?, end.parse::<u64>().ok()?.min(size - 1)),
    };
    (start <= end && start < size).then_some((start, end))
}

fn content_type(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "mp4" => "video/mp4",
        "m4v" => "video/x-m4v",
        "webm" => "video/webm",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plage_complete_ouverte_et_suffixe() {
        assert_eq!(parse_range("bytes=0-", 100), Some((0, 99)));
        assert_eq!(parse_range("bytes=10-19", 100), Some((10, 19)));
        assert_eq!(parse_range("bytes=-10", 100), Some((90, 99)));
    }

    #[test]
    fn plage_bornee_a_la_taille_du_fichier() {
        assert_eq!(parse_range("bytes=50-500", 100), Some((50, 99)));
    }

    #[test]
    fn plage_hors_fichier_ou_multiple_refusee() {
        assert_eq!(parse_range("bytes=100-", 100), None);
        assert_eq!(parse_range("bytes=20-10", 100), None);
        assert_eq!(parse_range("bytes=0-1,5-6", 100), None);
        assert_eq!(parse_range("items=0-1", 100), None);
    }

    #[test]
    fn cible_sans_le_jeton_refusee() {
        assert_eq!(resolve_target("/autre/%2Ftmp%2Fa.mp3", "/jeton/"), None);
        assert_eq!(resolve_target("/%2Ftmp%2Fa.mp3", "/jeton/"), None);
    }

    #[test]
    fn cible_decodee_en_chemin_absolu() {
        assert_eq!(
            resolve_target("/jeton/%2Fhome%2Fshin%2Fosu!%2FSongs%2F1%20A%20-%20B%2Faudio.mp3", "/jeton/"),
            Some(PathBuf::from("/home/shin/osu!/Songs/1 A - B/audio.mp3"))
        );
        assert_eq!(resolve_target("/jeton/relatif.mp3", "/jeton/"), None);
    }

    /// Serveur réel sur un dossier jetable, interrogé par une connexion TCP brute.
    struct Fixture {
        dir: PathBuf,
        server: MediaServer,
    }

    fn fixture(name: &str) -> Fixture {
        let dir = std::env::temp_dir().join(format!("osu-player-media-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("Songs")).unwrap();
        std::fs::write(dir.join("Songs/audio.mp3"), (0u8..=99).collect::<Vec<u8>>()).unwrap();
        std::fs::write(dir.join("secret.txt"), "secret").unwrap();
        let songs = dir.join("Songs");
        let server = MediaServer::start(move |p| p.starts_with(&songs)).unwrap();
        Fixture { dir, server }
    }

    impl Fixture {
        fn url_path(&self, file: &Path) -> String {
            let token_path = self.server.base_url.splitn(4, '/').nth(3).unwrap();
            let encoded = percent_encoding::utf8_percent_encode(
                file.to_str().unwrap(),
                percent_encoding::NON_ALPHANUMERIC,
            );
            format!("/{token_path}/{encoded}")
        }

        fn host(&self) -> String {
            self.server.base_url.split('/').nth(2).unwrap().to_string()
        }

        fn get(&self, path: &str, host: &str, range: Option<&str>) -> (String, Vec<u8>) {
            let mut stream = TcpStream::connect(self.host()).unwrap();
            let range = range.map(|r| format!("Range: {r}\r\n")).unwrap_or_default();
            write!(stream, "GET {path} HTTP/1.1\r\nHost: {host}\r\n{range}\r\n").unwrap();
            let mut response = Vec::new();
            stream.read_to_end(&mut response).unwrap();
            let split = response.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
            let head = String::from_utf8_lossy(&response[..split]).to_string();
            (head, response[split + 4..].to_vec())
        }
    }

    #[test]
    fn serveur_sert_une_plage_du_fichier_autorise() {
        let f = fixture("plage");
        let path = f.url_path(&f.dir.join("Songs/audio.mp3"));
        let (head, body) = f.get(&path, &f.host(), Some("bytes=10-14"));
        assert!(head.starts_with("HTTP/1.1 206"), "{head}");
        assert!(head.contains("Content-Range: bytes 10-14/100"), "{head}");
        assert!(head.contains("Content-Type: audio/mpeg"), "{head}");
        assert_eq!(body, vec![10, 11, 12, 13, 14]);
    }

    #[test]
    fn serveur_autorise_l_analyse_du_son_par_la_page() {
        let f = fixture("cors");
        let path = f.url_path(&f.dir.join("Songs/audio.mp3"));
        let (head, _) = f.get(&path, &f.host(), Some("bytes=0-9"));
        assert!(head.contains("Access-Control-Allow-Origin: *"), "{head}");
    }

    #[test]
    fn serveur_sert_le_fichier_entier_sans_plage() {
        let f = fixture("entier");
        let path = f.url_path(&f.dir.join("Songs/audio.mp3"));
        let (head, body) = f.get(&path, &f.host(), None);
        assert!(head.starts_with("HTTP/1.1 200"), "{head}");
        assert_eq!(body.len(), 100);
    }

    #[test]
    fn serveur_refuse_un_fichier_hors_du_dossier_autorise() {
        let f = fixture("hors");
        let (head, body) = f.get(&f.url_path(&f.dir.join("secret.txt")), &f.host(), None);
        assert!(head.starts_with("HTTP/1.1 403"), "{head}");
        assert!(body.is_empty());
    }

    #[test]
    fn serveur_refuse_un_autre_en_tete_host() {
        // Une page web qui ferait pointer son propre domaine sur 127.0.0.1.
        let f = fixture("host");
        let path = f.url_path(&f.dir.join("Songs/audio.mp3"));
        let (head, _) = f.get(&path, "attaquant.example", None);
        assert!(head.starts_with("HTTP/1.1 403"), "{head}");
    }

    #[test]
    fn serveur_refuse_une_url_sans_le_jeton() {
        let f = fixture("jeton");
        let encoded = percent_encoding::utf8_percent_encode(
            f.dir.join("Songs/audio.mp3").to_str().unwrap(),
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        let (head, _) = f.get(&format!("/0123456789abcdef/{encoded}"), &f.host(), None);
        assert!(head.starts_with("HTTP/1.1 404"), "{head}");
    }
}
