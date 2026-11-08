"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { FooterScene, Garland, SkySleigh, Tree } from "./Decorations";
import { MUSIC_EVENT, MUSIC_STATE_EVENT, type MusicCommand, type MusicState } from "./MusicPlayer";

// Écran d'accueil : affiché une fois par onglet (sessionStorage), au-dessus
// de la page déjà chargée (connexion ou liste), qu'il dévoile en s'effaçant.
// Il vit dans le layout racine : la navigation interne ne le remonte jamais,
// et un script en <head> (INTRO_HEAD_SCRIPT) le masque avant le premier
// affichage si l'onglet l'a déjà vu, sans flash.
//
// Musique : elle accompagne l'animation puis s'éteint en fondu quand
// l'accueil s'efface (le bouton « Musique » la relance ensuite). Sans clic
// préalable, la plupart des navigateurs interdisent le son : l'accueil
// attend alors un clic sur « Ouvrir avec la musique » (ou « Entrer sans
// musique ») au lieu de s'effacer en silence.
export const INTRO_KEY = "hotte-intro";
export const INTRO_HEAD_SCRIPT = `try{if(sessionStorage.getItem("${INTRO_KEY}"))document.documentElement.dataset.intro="vue"}catch(e){}`;

const DURATION_MS = 5200;
const REDUCED_MS = 2600;
const LEAVE_MS = 750;
/** Durée minimale de musique quand elle démarre seule, en cours d'animation. */
const MIN_MUSIC_MS = 4500;
/** Clic sur « Ouvrir avec la musique » mais rien ne joue : on n'attend pas plus. */
const MUSIC_TIMEOUT_MS = 6000;
const send = (cmd: MusicCommand) => window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: cmd }));

// Positions pseudo-aléatoires mais fixes : identiques au rendu serveur et client.
function seeded(n: number, seed: number) {
  let x = seed;
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => [r(), r(), r(), r()]);
}
const FLAKES = seeded(46, 7);
const STARS = seeded(28, 42);
const TITLE = "La Hotte familiale";

export function Intro({ days }: { days: number }) {
  const [phase, setPhase] = useState<"show" | "leaving" | "gone">("show");
  const [run, setRun] = useState(0); // relance la chorégraphie (synchro avec la musique)
  const [music, setMusic] = useState<MusicState | "idle">("idle");
  const [clicked, setClicked] = useState(false);
  const [timer, setTimer] = useState({ ms: DURATION_MS, key: 0 });
  const [armed, setArmed] = useState(false);
  // En attente : son bloqué (on attend le clic), ou musique demandée qui charge.
  const waiting = music === "blocked" || (clicked && music === "loading");

  const leave = useCallback(() => setPhase((p) => (p === "show" ? "leaving" : p)), []);

  // useLayoutEffect : décidé avant le premier affichage, donc sans flash. Le
  // script du <head> ne suffit pas : sur une page 404 (notFound), Next
  // reconstruit la page dans le navigateur et ce script ne s'exécute pas.
  useLayoutEffect(() => {
    let seen = document.documentElement.dataset.intro === "vue";
    try { seen ||= !!sessionStorage.getItem(INTRO_KEY); } catch { /* stockage indisponible */ }
    if (seen) { document.documentElement.dataset.intro = "vue"; setPhase("gone"); return; }
    setArmed(true); // le script tourne : le filet de sécurité CSS n'est plus utile
    try { sessionStorage.setItem(INTRO_KEY, "1"); } catch { /* navigation privée stricte */ }
    const onState = (e: Event) => setMusic((e as CustomEvent<MusicState>).detail);
    window.addEventListener(MUSIC_STATE_EVENT, onState);
    // Tentative de lecture automatique : le navigateur décide. Envoyée après
    // le montage du lecteur (effets des composants voisins).
    const t = setTimeout(() => send("auto"), 0);
    return () => { clearTimeout(t); window.removeEventListener(MUSIC_STATE_EVENT, onState); };
  }, []);

  useEffect(() => {
    if (phase !== "show" || waiting) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(leave, reduced ? Math.min(REDUCED_MS, timer.ms) : timer.ms);
    return () => clearTimeout(t);
  }, [phase, waiting, timer, leave]);

  // La musique démarre : après un clic, l'animation repart avec elle ; si elle
  // démarre seule, l'accueil dure assez pour qu'on l'entende vraiment.
  useEffect(() => {
    if (music !== "playing") return;
    if (clicked) { setRun((r) => r + 1); setTimer((t) => ({ ms: DURATION_MS, key: t.key + 1 })); }
    else setTimer((t) => ({ ms: MIN_MUSIC_MS, key: t.key + 1 }));
  }, [music, clicked]);

  useEffect(() => {
    if (!clicked || music !== "loading") return;
    const t = setTimeout(() => setMusic("unavailable"), MUSIC_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [clicked, music]);

  useEffect(() => {
    if (phase !== "leaving") return;
    send("stop"); // la musique de l'accueil s'éteint avec lui
    document.documentElement.dataset.intro = "vue";
    const t = setTimeout(() => setPhase("gone"), LEAVE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "show") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") leave(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, leave]);

  if (phase === "gone") return null;

  const playWithSound = () => {
    // Clic = geste de l'utilisateur : le navigateur autorise alors le son.
    send("play");
    setClicked(true);
    setMusic("loading");
  };

  return (
    <div className={`intro${armed ? " armed" : ""}${phase === "leaving" ? " leaving" : ""}`} role="dialog" aria-modal="false" aria-label="Bienvenue sur La Hotte familiale">
      <div className="intro-stage" key={run}>
        <div className="intro-sky" aria-hidden="true">
          {STARS.map(([x, y, s, d], i) => (
            <span key={i} className="intro-star" style={{ left: `${x * 100}%`, top: `${y * 55}%`, ["--s" as string]: 1 + s * 2.2, animationDelay: `${-d * 3}s` }} />
          ))}
          <span className="intro-moon" />
        </div>
        <Garland />
        <div className="intro-flight" aria-hidden="true">
          <SkySleigh className="intro-sleigh" />
          <span className="intro-trail" />
        </div>
        <div className="intro-snow" aria-hidden="true">
          {FLAKES.map(([x, sz, dur, d], i) => (
            <span key={i} style={{ left: `${x * 100}%`, width: 3 + sz * 6, height: 3 + sz * 6, animationDuration: `${5 + dur * 6}s`, animationDelay: `${-d * 10}s`, opacity: 0.5 + sz * 0.5 }} />
          ))}
        </div>

        <div className="intro-center">
          <Tree className="intro-tree" />
          <h1 className="intro-title" aria-label={TITLE}>
            {TITLE.split("").map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${1.1 + i * 0.045}s` }}>{c === " " ? " " : c}</span>)}
          </h1>
          <p className="intro-sub">{days === 0 ? "Joyeux Noël, c'est aujourd'hui !" : <>Joyeux Noël ! · <b>J-{days}</b></>}</p>
        </div>

        <FooterScene className="intro-ground" />
      </div>

      <div className="intro-actions">
        {music === "blocked" ? (
          <button type="button" className="btn intro-sound" onClick={playWithSound}>
            <span aria-hidden="true">🔊</span> Ouvrir avec la musique
          </button>
        ) : clicked && music === "loading" ? (
          <span className="intro-playing" role="status">Lancement de la musique…</span>
        ) : music === "playing" ? (
          <span className="intro-playing" role="status"><span aria-hidden="true">🎵</span> Mariah Carey — All I Want for Christmas Is You</span>
        ) : null}
        <button type="button" className="btn ghost intro-skip" onClick={leave}>
          {music === "blocked" ? "Entrer sans musique" : <>Entrer <span aria-hidden="true">→</span></>}
        </button>
      </div>
    </div>
  );
}
