// src/hooks/useAutoHide.ts
import { useCallback, useEffect, useRef, useState } from 'react';

// Le temps de lire ce qu'on survole, pas assez pour gêner la vidéo.
const IDLE_DELAY_MS = 2500;

interface AutoHideHandlers {
  onMouseMove?: () => void;
  onMouseDown?: () => void;
  onWheel?: () => void;
  onMouseLeave?: () => void;
}

/**
 * Contrôles qui s'effacent quand on ne s'en sert pas, comme sur un lecteur
 * vidéo, et reviennent au moindre mouvement.
 *
 * Le départ du pointeur ne suffit pas : sous Wayland, GTK signale la sortie de
 * fenêtre avec la dernière position connue, à l'intérieur, et WebKitGTK croit
 * le pointeur toujours là (`:hover` et `mouseleave` restent bloqués). La
 * minuterie d'inactivité, elle, fonctionne partout ; le départ, quand il est
 * bien signalé (X11, Windows), efface simplement plus tôt.
 */
export function useAutoHide(enabled: boolean): { hidden: boolean; handlers: AutoHideHandlers } {
  const [hidden, setHidden] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const wake = useCallback(() => {
    setHidden(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHidden(true), IDLE_DELAY_MS);
  }, []);

  useEffect(() => {
    if (!enabled) {
      clearTimeout(timer.current);
      setHidden(false);
      return;
    }
    // Sans attendre un mouvement : un pointeur posé sur la vidéo ne bouge pas.
    wake();
    return () => clearTimeout(timer.current);
  }, [enabled, wake]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setHidden(true);
  }, []);

  return {
    hidden: enabled && hidden,
    handlers: enabled
      ? { onMouseMove: wake, onMouseDown: wake, onWheel: wake, onMouseLeave: hide }
      : {},
  };
}
