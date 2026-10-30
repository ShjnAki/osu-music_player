// src/components/PinButton/PinButton.tsx
import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { PinIcon } from '@/components/Icons/Icons';
import type { PinState } from '@/hooks/useAlwaysOnTop';
import './PinButton.css';

// Le temps de lire la marche à suivre avant qu'elle ne s'efface.
const HINT_DURATION_MS = 8000;

interface Props {
  pin: PinState;
  className: string;
  hintPlacement: 'titlebar' | 'sphere';
}

/**
 * Épingle la fenêtre au premier plan. Là où l'appli ne peut pas le faire
 * (Wayland, ou Windows qui refuse sous WSL), le bouton explique comment le
 * demander au système plutôt que de rester sans effet.
 */
export function PinButton({ pin, className, hintPlacement }: Props) {
  const { alwaysOnTop, setAlwaysOnTop } = usePlayerStore();
  const [hint, setHint] = useState(false);
  const canPin = pin.support === 'native' || pin.support === 'wsl';

  const seenFailures = useRef(pin.failures);
  useEffect(() => {
    if (pin.failures === seenFailures.current) return;
    seenFailures.current = pin.failures;
    setHint(true);
  }, [pin.failures]);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const pinned = canPin && alwaysOnTop;
  const onClick = () => {
    if (canPin) {
      setHint(false);
      setAlwaysOnTop(!alwaysOnTop);
    } else if (pin.support === 'none') {
      setHint(!hint);
    }
  };

  return (
    <>
      <button
        className={`${className} ${pinned ? 'active' : ''}`}
        onClick={onClick}
        title="Always on top"
        aria-pressed={pinned}
      >
        <PinIcon pinned={pinned} />
      </button>
      {hint && (
        <div
          className={`pin-hint pin-hint-${hintPlacement}`}
          role="status"
          onClick={() => setHint(false)}
          // Dans la barre de titre, un appui qui remonte jusqu'à elle
          // déplacerait la fenêtre au lieu de fermer le message.
          onMouseDown={(e) => e.stopPropagation()}
        >
          {pin.support === 'wsl' ? (
            <>
              Windows didn't let the app pin its window from WSL. PowerToys can do it:
              press <kbd>Win+Ctrl+T</kbd> with <b>Always On Top</b> enabled.
            </>
          ) : (
            <>
              Wayland doesn't let an app keep itself on top. Ask your desktop instead:
              on GNOME, press <kbd>Alt+Space</kbd> and pick <b>Always on Top</b>.
            </>
          )}
        </div>
      )}
    </>
  );
}
