// src/components/ResizeHandles/ResizeHandles.tsx
import type { MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './ResizeHandles.css';

type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];

const EDGES: ResizeDirection[] = [
  'North', 'South', 'East', 'West',
  'NorthEast', 'NorthWest', 'SouthEast', 'SouthWest',
];

function startResize(direction: ResizeDirection) {
  return (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    getCurrentWindow().startResizeDragging(direction).catch(() => {});
  };
}

/**
 * Bords et coins qui redimensionnent la fenêtre, avec le curseur qui
 * l'annonce. Sans cadre, rien n'indiquait qu'elle pouvait s'agrandir : le
 * curseur ne changeait pas au bord, contrairement aux autres fenêtres.
 */
export function ResizeHandles() {
  return (
    <>
      {EDGES.map((direction) => (
        <div
          key={direction}
          className={`resize-edge resize-${direction.toLowerCase()}`}
          onMouseDown={startResize(direction)}
        />
      ))}
      <div className="resize-grip" onMouseDown={startResize('SouthEast')} title="Drag to resize">
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M9 3L3 9M9 6L6 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>
    </>
  );
}
