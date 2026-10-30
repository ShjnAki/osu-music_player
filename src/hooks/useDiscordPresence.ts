// src/hooks/useDiscordPresence.ts
import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePlayerStore } from '@/stores/playerStore';

// Au-delà, la position annoncée à Discord ne correspond plus : un saut, ou un
// démarrage au point d'aperçu.
const DRIFT_MS = 2000;

/**
 * Affiche la piste en cours sur le profil Discord (option discordPresence).
 * N'envoie qu'aux changements, pas à chaque tick : Discord limite le rythme
 * des mises à jour.
 */
export function useDiscordPresence() {
  const { discordPresence, currentTrack, status, audioTime } = usePlayerStore();
  const sent = useRef<{ key: string; startMs: number | null } | null>(null);

  useEffect(() => {
    const send = (activity: object | null) => invoke('set_discord_activity', { activity }).catch(() => {});
    if (!discordPresence || !currentTrack || status === 'idle' || status === 'error') {
      if (sent.current) {
        sent.current = null;
        send(null);
      }
      return;
    }
    // Entre deux pistes : la suivante s'annoncera en démarrant.
    if (status === 'loading') return;

    const playing = status === 'playing';
    const startMs = playing ? Math.round(Date.now() - audioTime * 1000) : null;
    const key = `${currentTrack.id}|${playing}`;
    const prev = sent.current;
    if (prev?.key === key && (!playing || Math.abs((prev.startMs ?? 0) - (startMs ?? 0)) < DRIFT_MS)) return;

    sent.current = { key, startMs };
    send({
      title: currentTrack.title,
      artist: currentTrack.artist,
      start_ms: startMs,
      end_ms: startMs != null && currentTrack.duration ? startMs + currentTrack.duration * 1000 : null,
      paused: !playing,
    });
  }, [discordPresence, currentTrack, status, audioTime]);
}
