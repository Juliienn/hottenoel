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
/** « off » quand le membre a coupé la musique : l'accueil ne la relance plus
 * d'office (le bouton reste disponible). Mémorisé sur l'appareil. */
const PREF = "hotte-musique-auto";

// Pilotage depuis l'écran d'accueil (cf. Intro.tsx) :
//  - "auto" : tentative de lecture sans clic. La plupart des navigateurs la
//    refusent avec le son tant que l'utilisateur n'a pas interagi avec le
//    site ; on le détecte et on annonce "blocked", sans rien afficher.
//  - "play" : lecture suite à un clic (toujours autorisée).
export const MUSIC_EVENT = "hotte-musique";
export const MUSIC_STATE_EVENT = "hotte-musique-etat";
export type MusicState = "loading" | "playing" | "blocked" | "unavailable";
const announce = (s: MusicState) => window.dispatchEvent(new CustomEvent(MUSIC_STATE_EVENT, { detail: s }));
const AUTOPLAY_GRACE_MS = 2500;

type Status = "off" | "resumable" | "probing" | "loading" | "playing" | "paused" | "error";

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

  const statusRef = useRef<Status>("off");
  useEffect(() => { statusRef.current = status; }, [status]);

  const destroy = () => {
    try { playerRef.current?.destroy(); } catch { /* lecteur déjà détruit */ }
    playerRef.current = null;
    hostRef.current?.replaceChildren();
  };

  /** auto = sans clic : en cas de refus ou d'échec, retour discret à l'état
   * initial (le bouton « Musique » reste là) au lieu d'un message d'erreur. */
  const start = useCallback(async (auto = false) => {
    // Une tentative automatique en cours est remplacée par un vrai départ,
    // créé pendant le clic (seul cas où le son est garanti).
    if (!auto && statusRef.current === "probing") destroy();
    if (playerRef.current) { playerRef.current.playVideo(); return; }
    if (auto) {
      const policy = (navigator as any).getAutoplayPolicy?.("mediaelement");
      if (policy === "disallowed") { announce("blocked"); return; }
    }
    setStatus(auto ? "probing" : "loading");
    statusRef.current = auto ? "probing" : "loading";
    if (!auto) { try { localStorage.removeItem(PREF); } catch { /* ignoré */ } }
    announce("loading");
    try {
      await loadYouTubeApi();
    } catch {
      if (auto) { setStatus("off"); announce("unavailable"); } else { setStatus("error"); announce("unavailable"); }
      return;
    }
    if (auto && statusRef.current !== "probing") return; // remplacé par un clic entre-temps
    const host = hostRef.current;
    if (!host) return;
    // Le lecteur remplace cet élément par une iframe : il est créé hors de
    // React pour que React ne tente jamais de le réconcilier.
    const target = document.createElement("div");
    host.replaceChildren(target);
    const startAt = auto ? 0 : Math.floor(readStore()?.t ?? 0);
    writeStore({ t: startAt });
    let grace: ReturnType<typeof setTimeout> | undefined;
    const player = new window.YT.Player(target, {
      videoId: VIDEO_ID, width: 200, height: 113,
      playerVars: { autoplay: 1, loop: 1, playlist: VIDEO_ID, start: startAt, playsinline: 1, rel: 0, modestbranding: 1 },
      events: {
        onReady: (e: any) => {
          e.target.setVolume(45); e.target.playVideo();
          if (auto) {
            // Toujours pas de lecture après ce délai : le navigateur a bloqué le son.
            grace = setTimeout(() => {
              if (playerRef.current !== player || statusRef.current !== "probing") return;
              destroy(); writeStore(null); setStatus("off"); announce("blocked");
            }, AUTOPLAY_GRACE_MS);
          }
        },
        onStateChange: (e: any) => {
          if (playerRef.current !== player) return;
          if (e.data === 1) { clearTimeout(grace); setStatus("playing"); announce("playing"); }
          else if (e.data === 2) setStatus("paused");
        },
        // 101/150 : intégration refusée par l'ayant droit ; 100 : vidéo retirée.
        onError: () => {
          if (playerRef.current !== player) return;
          clearTimeout(grace);
          if (statusRef.current === "probing") { destroy(); writeStore(null); setStatus("off"); } else setStatus("error");
          announce("unavailable");
        },
      },
    });
    playerRef.current = player;
  }, []);

  useEffect(() => {
    const onCommand = (e: Event) => {
      const cmd = (e as CustomEvent<"auto" | "play">).detail;
      if (cmd === "play") { void start(false); return; }
      let pref: string | null = null;
      try { pref = localStorage.getItem(PREF); } catch { /* ignoré */ }
      if (pref === "off") { announce("blocked"); return; }
      void start(true);
    };
    window.addEventListener(MUSIC_EVENT, onCommand);
    return () => window.removeEventListener(MUSIC_EVENT, onCommand);
  }, [start]);

  const pause = () => playerRef.current?.pauseVideo();
  const resume = () => playerRef.current?.playVideo();
  const stop = () => {
    destroy();
    writeStore(null);
    try { localStorage.setItem(PREF, "off"); } catch { /* ignoré */ }
    setStatus("off");
  };

  const probing = status === "probing";
  const active = probing || status === "loading" || status === "playing" || status === "paused" || status === "error";
  const Note = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="6" cy="18" r="3" fill="currentColor" /><circle cx="17" cy="16" r="3" fill="currentColor" /></svg>
  );

  return (
    <div className="music">
      {/* Pendant une tentative automatique, le lecteur existe mais reste
          transparent : rien n'apparaît si le navigateur refuse le son. */}
      <div className={`music-panel${probing ? " probing" : ""}`} hidden={!active} aria-label="Lecteur de musique" aria-hidden={probing || undefined}>
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
      {!active || probing ? (
        <button type="button" className="music-toggle" onClick={() => void start(false)} aria-label={status === "resumable" ? "Reprendre la musique de Noël" : "Activer la musique de Noël"}>
          <Note /><span className="music-label">{status === "resumable" ? "Reprendre la musique" : "Musique"}</span>
        </button>
      ) : null}
    </div>
  );
}
