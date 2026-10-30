// src/lib/localMedia.ts
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

// Sous Linux, le Rust sert les médias en HTTP local (voir media_server.rs) :
// WebKitGTK ne lit pas un média servi par asset://, et lit de travers certains
// mp3 chargés en blob. Ailleurs, la commande renvoie null et asset:// suffit.
let mediaBaseUrl: Promise<string | null> | null = null;

export async function localMediaUrl(path: string): Promise<string> {
  mediaBaseUrl ??= invoke<string | null>('media_base_url').catch(() => null);
  const base = await mediaBaseUrl;
  return base ? `${base}/${encodeURIComponent(path)}` : convertFileSrc(path);
}
