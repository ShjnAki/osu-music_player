// src/lib/localMedia.ts
import { convertFileSrc } from '@tauri-apps/api/core';

// WebKitGTK refuse de lire un <audio> ou <video> dont la source est asset://
// (MEDIA_ERR_SRC_NOT_SUPPORTED), alors qu'il en lit très bien le contenu par
// fetch : sous Linux, le média passe donc par un blob en mémoire. WebView2
// (Windows) et WKWebView (macOS) lisent asset:// directement, en flux.
const NEEDS_BLOB = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent);

export interface LocalMedia {
  url: string;
  /** Libère le blob éventuel : sans ça, chaque piste jouée resterait en mémoire. */
  release: () => void;
}

export async function openLocalMedia(path: string): Promise<LocalMedia> {
  const url = convertFileSrc(path);
  if (!NEEDS_BLOB) return { url, release: () => {} };
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${path}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  return { url: objectUrl, release: () => URL.revokeObjectURL(objectUrl) };
}
