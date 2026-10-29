// src/hooks/useVirtualRows.ts
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Fenêtre de lignes à monter dans une liste à hauteur de ligne fixe.
 *
 * Une bibliothèque osu! dépasse couramment plusieurs milliers de pistes : les
 * monter toutes coûtait plus d'une seconde au démarrage, puis un re-rendu
 * complet à chaque mise à jour du store (clic, tick de progression).
 */
export function useVirtualRows<T extends HTMLElement>(count: number, rowHeight: number, overscan = 8) {
  const containerRef = useRef<T>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [paddingTop, setPaddingTop] = useState(0);

  // Mesure avant la peinture, sinon la première image ne montre que l'overscan.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setViewportHeight(el.clientHeight);
      // Le padding du conteneur décale les lignes sans changer scrollTop.
      setPaddingTop(parseFloat(getComputedStyle(el).paddingTop) || 0);
    };
    const onScroll = () => setScrollTop(el.scrollTop);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  const firstVisible = Math.floor(Math.max(0, scrollTop - paddingTop) / rowHeight);
  const start = Math.max(0, firstVisible - overscan);
  const end = Math.min(count, firstVisible + Math.ceil(viewportHeight / rowHeight) + 1 + overscan);

  return {
    containerRef,
    start,
    end,
    totalHeight: count * rowHeight,
    offsetTop: start * rowHeight,
  };
}
