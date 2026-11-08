"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// « All I Want for Christmas Is You » de Mariah Carey, clip officiel sur
// YouTube. Lu via le lecteur intégré de YouTube : c'est le seul moyen légal
// de diffuser ce titre sur un site sans en détenir les droits (héberger le
// fichier MP3 serait une rediffusion). Les conditions de YouTube imposent un
// lecteur visible : il s'affiche dans le petit panneau en bas à droite.
//
// Le composant vit dans le layout racine : Next ne le démonte pas en
// changeant de page, la musique continue donc sans se relancer. Après un
// rechargement complet, le navigateur exige un nouveau clic avant de jouer du
// son : on propose alors « Reprendre » à l'endroit où la musique s'était arrêtée.
const VIDEO_ID = "yXQViqx6GMY";
const STORE = "hotte-musique";

type Status = "off" | "resumable" | "loading" | "playing" | "paused" | "error";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  apiPromise ??= new Promise<void>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error("YouTube injoignable")); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

function readStore(): { t: number } | null {
  try { const raw = sessionStorage.getItem(STORE); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeStore(v: { t: number } | null) {
  try { if (v) sessionStorage.setItem(STORE, JSON.stringify(v)); else sessionStorage.removeItem(STORE); } catch { /* stockage indisponible */ }
}

export function MusicPlayer() {
  const [status, setStatus] = useState<Status>("off");
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => { if (readStore()) setStatus("resumable"); }, []);

  // Mémorise la position toutes les 5 s pour reprendre après un rechargement.
  useEffect(() => {
    if (status !== "playing") return;
    const id = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.();
      if (typeof t === "number") writeStore({ t });
    }, 5000);
    return () => clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    if (playerRef.current) { playerRef.current.playVideo(); return; }
    setStatus("loading");
    try {
      await loadYouTubeApi();
    } catch {
      setStatus("error");
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    // Le lecteur remplace cet élément par une iframe : il est créé hors de
    // React pour que React ne tente jamais de le réconcilier.
    const target = document.createElement("div");
    host.replaceChildren(target);
    const startAt = Math.floor(readStore()?.t ?? 0);
    writeStore({ t: startAt });
    playerRef.current = new window.YT.Player(target, {
      videoId: VIDEO_ID, width: 200, height: 113,
      playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, start: startAt, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: (e: any) => { e.target.setVolume(45); e.target.playVideo(); },
        onStateChange: (e: any) => {
          if (e.data === 1) setStatus("playing");
          else if (e.data === 2) setStatus("paused");
        },
        // 101/150 : intégration refusée par l'ayant droit ; 100 : vidéo retirée.
        onError: () => setStatus("error"),
      },
    });
  }, []);

  const pause = () => playerRef.current?.pauseVideo();
  const resume = () => playerRef.current?.playVideo();
  const stop = () => {
    try { playerRef.current?.destroy(); } catch { /* lecteur déjà détruit */ }
    playerRef.current = null;
    hostRef.current?.replaceChildren();
    writeStore(null);
    setStatus("off");
  };

  const active = status === "loading" || status === "playing" || status === "paused" || status === "error";
  const Note = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" fill="currentColor" /><circle cx="17" cy="16" r="3" fill="currentColor" /></svg>
  );

  return (
    <div className="music">
      <div className="music-panel" hidden={!active} aria-label="Lecteur de musique">
        <div className="video" ref={hostRef} />
        <p className="title">Mariah Carey — All I Want for Christmas Is You</p>
        {status === "error" ? (
          <p className="status err" style={{ margin: 0 }}>
            La musique ne peut pas être lue ici.{" "}
            <a href={`https://www.youtube.com/watch?v=${VIDEO_ID}`} target="_blank" rel="noopener noreferrer">L&apos;écouter sur YouTube</a>
          </p>
        ) : null}
        <div className="controls">
          {status === "playing" ? <button type="button" className="btn small" onClick={pause}>Pause</button> : null}
          {status === "paused" ? <button type="button" className="btn small" onClick={resume}>Reprendre</button> : null}
          {status === "loading" ? <span className="hint">Chargement…</span> : null}
          <button type="button" className="btn ghost small" onClick={stop}>Couper la musique</button>
        </div>
      </div>
      {!active ? (
        <button type="button" className="music-toggle" onClick={start} aria-label={status === "resumable" ? "Reprendre la musique de Noël" : "Activer la musique de Noël"}>
          <Note /><span className="music-label">{status === "resumable" ? "Reprendre la musique" : "Musique"}</span>
        </button>
      ) : null}
    </div>
  );
}
