// src/components/PinButton/PinButton.tsx
import { useEffect, useState } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { PinIcon } from '@/components/Icons/Icons';
import './PinButton.css';

// Le temps de lire la marche à suivre avant qu'elle ne s'efface.
const HINT_DURATION_MS = 8000;

interface Props {
  /** Ce que renvoie useAlwaysOnTop : null tant qu'on ne le sait pas. */
  supported: boolean | null;
  className: string;
  hintPlacement: 'titlebar' | 'sphere';
}

/**
 * Épingle la fenêtre au premier plan. Là où elle ne peut pas le faire
 * d'elle-même (Wayland), le bouton explique comment le demander au système
 * plutôt que de rester sans effet.
 */
export function PinButton({ supported, className, hintPlacement }: Props) {
  const { alwaysOnTop, setAlwaysOnTop } = usePlayerStore();
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  const pinned = !!supported && alwaysOnTop;
  const onClick = () => {
    if (supported) setAlwaysOnTop(!alwaysOnTop);
    else if (supported === false) setHint(!hint);
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
          Wayland doesn't let an app keep itself on top. Ask your desktop instead:
          on GNOME, press <kbd>Alt+Space</kbd> and pick <b>Always on Top</b>.
        </div>
      )}
    </>
  );
}
