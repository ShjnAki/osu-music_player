// src/hooks/useAlwaysOnTop.ts
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Applique l'épingle au premier plan à la fenêtre, et dit si elle le peut :
 * null tant que le backend n'a pas répondu, faux sous Wayland, où la demande
 * serait ignorée sans erreur.
 */
export function useAlwaysOnTop(): boolean | null {
  const alwaysOnTop = usePlayerStore((s) => s.alwaysOnTop);
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    invoke<boolean>('always_on_top_supported').then(setSupported, () => setSupported(false));
  }, []);

  useEffect(() => {
    if (supported) getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(() => {});
  }, [alwaysOnTop, supported]);

  return supported;
}
