// src/hooks/useAlwaysOnTop.ts
import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { usePlayerStore } from '@/stores/playerStore';

/**
 * Comment la fenêtre peut se garder au premier plan (voir always_on_top_support
 * côté Rust) : elle-même, par Windows sous WSL, ou pas du tout (Wayland).
 */
export type PinSupport = 'native' | 'wsl' | 'none';

export interface PinState {
  /** null tant que le backend n'a pas répondu. */
  support: PinSupport | null;
  /**
   * Nombre de refus de Windows (WSL) : un compteur plutôt qu'un drapeau, pour
   * que le bouton ne signale que les nouveaux, pas un ancien à chaque fois
   * qu'il réapparaît en changeant de mode.
   */
  failures: number;
}

/** Applique l'épingle au premier plan à la fenêtre, selon ce que permet le système. */
export function useAlwaysOnTop(): PinState {
  const { alwaysOnTop, setAlwaysOnTop, isSphereMode } = usePlayerStore();
  const [support, setSupport] = useState<PinSupport | null>(null);
  const [failures, setFailures] = useState(0);
  // Sous WSL, chaque demande lance PowerShell : pas de « désépingler » pour
  // une fenêtre qu'on n'a jamais épinglée.
  const appliedRef = useRef(false);

  useEffect(() => {
    invoke<PinSupport>('always_on_top_support').then(setSupport, () => setSupport('none'));
  }, []);

  useEffect(() => {
    if (support === 'native') {
      getCurrentWindow().setAlwaysOnTop(alwaysOnTop).catch(() => {});
      return;
    }
    if (support !== 'wsl' || (!alwaysOnTop && !appliedRef.current)) return;
    // Redemandé aussi au changement de mode : on ignore si Windows garde le
    // rang d'une fenêtre WSL que l'on redimensionne.
    appliedRef.current = alwaysOnTop;
    invoke('set_wsl_topmost', { enabled: alwaysOnTop }).catch(() => {
      appliedRef.current = false;
      setFailures((n) => n + 1);
      setAlwaysOnTop(false);
    });
  }, [alwaysOnTop, support, isSphereMode]);

  return { support, failures };
}
