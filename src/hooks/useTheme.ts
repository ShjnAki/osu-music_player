import { useEffect } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import type { Theme } from '@/types';

const BUILTIN_THEMES: Theme[] = [
  {
    id: 'default', name: 'osu! Dark',
    variables: {
      '--bg-primary': '#0d0d12', '--bg-secondary': '#16161f', '--bg-tertiary': '#1e1e2a',
      '--accent': '#ff66aa', '--accent-hover': '#ff88bb', '--accent-subtle': 'rgba(255,102,170,0.1)',
      '--text-primary': '#ffffff', '--text-secondary': '#ccccdd', '--text-muted': '#666677',
      '--radius': '12px', '--blur': '20px', '--border': 'rgba(255,255,255,0.06)',
      '--font-main': "'Segoe UI', system-ui, sans-serif", '--bg-opacity': '0.95',
    }
  },
  {
    id: 'glass', name: 'Glass',
    variables: {
      '--bg-primary': 'rgba(15,15,25,0.75)', '--bg-secondary': 'rgba(25,25,40,0.6)', '--bg-tertiary': 'rgba(35,35,55,0.5)',
      '--accent': '#a78bfa', '--accent-hover': '#c4b5fd', '--accent-subtle': 'rgba(167,139,250,0.12)',
      '--text-primary': '#f0f0ff', '--text-secondary': '#b0b0cc', '--text-muted': '#606080',
      '--radius': '16px', '--blur': '40px', '--border': 'rgba(255,255,255,0.12)',
      '--font-main': "'Segoe UI', system-ui, sans-serif", '--bg-opacity': '0.75',
    }
  },
  {
    id: 'sakura', name: 'Sakura',
    variables: {
      '--bg-primary': '#1a0a10', '--bg-secondary': '#240f18', '--bg-tertiary': '#2e1520',
      '--accent': '#ff9ec4', '--accent-hover': '#ffb8d4', '--accent-subtle': 'rgba(255,158,196,0.1)',
      '--text-primary': '#ffe8f0', '--text-secondary': '#cc99aa', '--text-muted': '#7a4455',
      '--radius': '20px', '--blur': '25px', '--border': 'rgba(255,150,180,0.1)',
      '--font-main': "'Segoe UI', system-ui, sans-serif", '--bg-opacity': '0.97',
    }
  },
  {
    id: 'minimal', name: 'Minimal Light',
    variables: {
      '--bg-primary': '#f5f5f7', '--bg-secondary': '#ffffff', '--bg-tertiary': '#ebebed',
      '--accent': '#007aff', '--accent-hover': '#0066dd', '--accent-subtle': 'rgba(0,122,255,0.1)',
      '--text-primary': '#1d1d1f', '--text-secondary': '#48484a', '--text-muted': '#aeaeb2',
      '--radius': '10px', '--blur': '0px', '--border': 'rgba(0,0,0,0.08)',
      '--font-main': "'Segoe UI', system-ui, sans-serif", '--bg-opacity': '1',
    }
  },
];

export function useTheme() {
  const { currentTheme, setTheme } = usePlayerStore();

  useEffect(() => {
    if (!currentTheme) setTheme(BUILTIN_THEMES[0]);
  }, []);

  useEffect(() => {
    if (!currentTheme) return;
    const root = document.documentElement;
    Object.entries(currentTheme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [currentTheme]);

  return { themes: BUILTIN_THEMES, currentTheme, setTheme };
}
