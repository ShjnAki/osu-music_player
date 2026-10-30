// src-tauri/src/osu_collections.rs

//! Collections d'osu! (stable) : `collection.db`, à côté du dossier Songs.
//!
//! Une collection désigne ses beatmaps par le MD5 de leur fichier `.osu`, une
//! difficulté précise. On retrouve donc le dossier de chaque difficulté en
//! hachant les `.osu` des dossiers de la bibliothèque. osu!lazer range ses
//! collections ailleurs (`client.realm`) et n'est pas pris en charge.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq)]
pub struct Collection {
    pub name: String,
    pub beatmap_hashes: Vec<String>,
}

/// Piste de la bibliothèque, telle que l'interface la connaît.
#[derive(Deserialize)]
pub struct LibraryTrack {
    pub id: String,
    pub path: String,
}

/// Collection traduite en pistes de la bibliothèque.
#[derive(Serialize)]
pub struct ImportedCollection {
    pub name: String,
    pub track_ids: Vec<String>,
    /// Beatmaps de la collection absentes de la bibliothèque.
    pub missing: usize,
}

/// `collection.db` d'une installation d'osu! : le dossier Songs est rangé
/// dans celui d'osu!, qui contient aussi les bases de données.
pub fn collection_db_path(songs_folder: &Path) -> Option<PathBuf> {
    songs_folder.parent().map(|osu| osu.join("collection.db"))
}

struct Reader<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl Reader<'_> {
    fn take(&mut self, n: usize) -> Result<&[u8], String> {
        let end = self.pos.checked_add(n).filter(|end| *end <= self.bytes.len());
        let end = end.ok_or("collection.db is truncated")?;
        let slice = &self.bytes[self.pos..end];
        self.pos = end;
        Ok(slice)
    }

    fn int(&mut self) -> Result<u32, String> {
        let b = self.take(4)?;
        Ok(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    /// Chaîne d'osu! : 0x00 pour une chaîne absente, ou 0x0b suivi de la
    /// longueur en ULEB128 puis de l'UTF-8.
    fn string(&mut self) -> Result<String, String> {
        match self.take(1)?[0] {
            0x00 => Ok(String::new()),
            0x0b => {
                let mut len: usize = 0;
                let mut shift = 0;
                loop {
                    let byte = self.take(1)?[0];
                    len |= ((byte & 0x7f) as usize) << shift;
                    if byte & 0x80 == 0 {
                        break;
                    }
                    shift += 7;
                    if shift > 28 {
                        return Err("collection.db has an invalid string length".into());
                    }
                }
                Ok(String::from_utf8_lossy(self.take(len)?).into_owned())
            }
            other => Err(format!("collection.db has an unexpected string marker {other:#x}")),
        }
    }
}

pub fn parse_collection_db(bytes: &[u8]) -> Result<Vec<Collection>, String> {
    let mut r = Reader { bytes, pos: 0 };
    let _version = r.int()?;
    let count = r.int()?;
    (0..count)
        .map(|_| {
            let name = r.string()?;
            let n = r.int()?;
            let beatmap_hashes = (0..n).map(|_| r.string()).collect::<Result<_, _>>()?;
            Ok(Collection { name, beatmap_hashes })
        })
        .collect()
}

/// Traduit les collections en pistes : hache les `.osu` du dossier de chaque
/// piste, et s'arrête dès que toutes les beatmaps des collections sont
/// trouvées — sur un disque lent, ou à travers WSL, lire des dizaines de
/// milliers de `.osu` prend du temps.
pub fn import(collections: &[Collection], tracks: &[LibraryTrack]) -> Vec<ImportedCollection> {
    let mut tracks_by_folder: HashMap<PathBuf, Vec<String>> = HashMap::new();
    for track in tracks {
        if let Some(folder) = Path::new(&track.path).parent() {
            tracks_by_folder.entry(folder.to_path_buf()).or_default().push(track.id.clone());
        }
    }
    let mut wanted: HashSet<&str> = collections
        .iter()
        .flat_map(|c| c.beatmap_hashes.iter().map(String::as_str))
        .collect();
    let mut folder_of_hash: HashMap<String, PathBuf> = HashMap::new();

    for folder in tracks_by_folder.keys() {
        if wanted.is_empty() {
            break;
        }
        let Ok(entries) = std::fs::read_dir(folder) else { continue };
        for entry in entries.filter_map(|e| e.ok()) {
            if !entry.file_name().to_string_lossy().to_lowercase().ends_with(".osu") {
                continue;
            }
            let Ok(bytes) = std::fs::read(entry.path()) else { continue };
            let hash = md5_hex(&bytes);
            if wanted.remove(hash.as_str()) {
                folder_of_hash.insert(hash, folder.clone());
            }
        }
    }

    collections
        .iter()
        .map(|collection| {
            let mut track_ids: Vec<String> = Vec::new();
            let mut missing = 0;
            for hash in &collection.beatmap_hashes {
                match folder_of_hash.get(hash).and_then(|folder| tracks_by_folder.get(folder)) {
                    Some(ids) => {
                        // Plusieurs difficultés d'une même beatmap : une seule fois la piste.
                        for id in ids {
                            if !track_ids.contains(id) {
                                track_ids.push(id.clone());
                            }
                        }
                    }
                    None => missing += 1,
                }
            }
            ImportedCollection { name: collection.name.clone(), track_ids, missing }
        })
        .collect()
}

/// MD5 (RFC 1321), en hexadécimal minuscule comme dans `collection.db`.
pub fn md5_hex(input: &[u8]) -> String {
    const S: [u32; 64] = [
        7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5,
        9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10,
        15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
    ];
    let k: Vec<u32> = (0..64)
        .map(|i| ((i as f64 + 1.0).sin().abs() * 4294967296.0) as u32)
        .collect();
    let mut message = input.to_vec();
    let bit_len = (input.len() as u64).wrapping_mul(8);
    message.push(0x80);
    while message.len() % 64 != 56 {
        message.push(0);
    }
    message.extend_from_slice(&bit_len.to_le_bytes());

    let (mut a0, mut b0, mut c0, mut d0) = (0x67452301u32, 0xefcdab89u32, 0x98badcfeu32, 0x10325476u32);
    for chunk in message.chunks(64) {
        let m: Vec<u32> = chunk
            .chunks(4)
            .map(|w| u32::from_le_bytes([w[0], w[1], w[2], w[3]]))
            .collect();
        let (mut a, mut b, mut c, mut d) = (a0, b0, c0, d0);
        for i in 0..64 {
            let (f, g) = match i / 16 {
                0 => ((b & c) | (!b & d), i),
                1 => ((d & b) | (!d & c), (5 * i + 1) % 16),
                2 => (b ^ c ^ d, (3 * i + 5) % 16),
                _ => (c ^ (b | !d), (7 * i) % 16),
            };
            let f = f.wrapping_add(a).wrapping_add(k[i]).wrapping_add(m[g]);
            a = d;
            d = c;
            c = b;
            b = b.wrapping_add(f.rotate_left(S[i]));
        }
        a0 = a0.wrapping_add(a);
        b0 = b0.wrapping_add(b);
        c0 = c0.wrapping_add(c);
        d0 = d0.wrapping_add(d);
    }
    [a0, b0, c0, d0]
        .iter()
        .flat_map(|w| w.to_le_bytes())
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn md5_des_vecteurs_de_la_rfc() {
        assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(md5_hex(b"abc"), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(
            md5_hex(b"The quick brown fox jumps over the lazy dog"),
            "9e107d9d372bb6826bd81d3542a419d6"
        );
        // Plus d'un bloc de 64 octets.
        assert_eq!(
            md5_hex(b"12345678901234567890123456789012345678901234567890123456789012345678901234567890"),
            "57edf4a22be3c955ac49da2e2107b67a"
        );
    }

    fn osu_string(s: &str) -> Vec<u8> {
        let mut out = vec![0x0b];
        let mut len = s.len();
        loop {
            let byte = (len & 0x7f) as u8;
            len >>= 7;
            if len == 0 {
                out.push(byte);
                break;
            }
            out.push(byte | 0x80);
        }
        out.extend_from_slice(s.as_bytes());
        out
    }

    fn collection_db(collections: &[(&str, &[&str])]) -> Vec<u8> {
        let mut db = 20240101u32.to_le_bytes().to_vec();
        db.extend((collections.len() as u32).to_le_bytes());
        for (name, hashes) in collections {
            db.extend(osu_string(name));
            db.extend((hashes.len() as u32).to_le_bytes());
            for hash in *hashes {
                db.extend(osu_string(hash));
            }
        }
        db
    }

    #[test]
    fn collections_lues() {
        let long_name = "x".repeat(200); // longueur ULEB128 sur deux octets
        let db = collection_db(&[("Farm", &["aa", "bb"]), (&long_name, &[])]);
        assert_eq!(
            parse_collection_db(&db).unwrap(),
            vec![
                Collection { name: "Farm".into(), beatmap_hashes: vec!["aa".into(), "bb".into()] },
                Collection { name: long_name, beatmap_hashes: vec![] },
            ]
        );
    }

    #[test]
    fn fichier_tronque_refuse_sans_paniquer() {
        let db = collection_db(&[("Farm", &["aa", "bb"])]);
        assert!(parse_collection_db(&db[..db.len() - 1]).is_err());
        assert!(parse_collection_db(&[1, 0]).is_err());
    }

    #[test]
    fn collection_db_a_cote_du_dossier_songs() {
        assert_eq!(
            collection_db_path(Path::new("/mnt/s/osu!/Songs")),
            Some(PathBuf::from("/mnt/s/osu!/collection.db"))
        );
    }

    #[test]
    fn collections_traduites_en_pistes() {
        let root = std::env::temp_dir().join(format!("osu-collections-{}", std::process::id()));
        let (set_a, set_b) = (root.join("1 A - Song"), root.join("2 B - Other"));
        std::fs::create_dir_all(&set_a).unwrap();
        std::fs::create_dir_all(&set_b).unwrap();
        std::fs::write(set_a.join("easy.osu"), b"easy").unwrap();
        std::fs::write(set_a.join("hard.osu"), b"hard").unwrap();
        std::fs::write(set_b.join("normal.osu"), b"normal").unwrap();
        let tracks = vec![
            LibraryTrack { id: "a".into(), path: set_a.join("audio.mp3").to_string_lossy().into() },
            LibraryTrack { id: "b".into(), path: set_b.join("audio.mp3").to_string_lossy().into() },
        ];
        let collections = vec![Collection {
            name: "Farm".into(),
            // Deux difficultés de la même beatmap, l'autre, et une absente.
            beatmap_hashes: vec![md5_hex(b"hard"), md5_hex(b"easy"), md5_hex(b"normal"), "0".repeat(32)],
        }];
        let imported = import(&collections, &tracks);
        std::fs::remove_dir_all(&root).ok();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0].name, "Farm");
        assert_eq!(imported[0].track_ids, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(imported[0].missing, 1);
    }
}
