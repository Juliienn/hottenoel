"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { revealMyReceiverAction } from "@/app/actions/santa";
import { Avatar } from "@/components/Avatar";
import { MUSIC_EVENT, MUSIC_STATE_EVENT, type MusicCommand, type MusicState } from "@/components/MusicPlayer";

// Révélation du Secret Santa : ~12 s de mise en scène, puis le prénom.
//
// Confidentialité : le prénom n'est demandé au serveur qu'au clic, par
// revealMyReceiverAction, qui ne connaît que l'utilisateur connecté. Rejouer
// l'animation relit le même tirage enregistré : aucun nouveau tirage possible.
//
// Musique : on démarre la chanson SONG_START secondes avant le « drop »
// (fin de l'intro lente, « …all I want for Christmas is you », puis la
// batterie entre) pour que le cadeau s'ouvre pile dessus, à OPEN_AT.

/** Instant de la vidéo officielle où la batterie entre (à ajuster si besoin). */
export const SONG_DROP_S = 53;
const OPEN_AT = 8000;
const SONG_START_S = SONG_DROP_S - OPEN_AT / 1000;
const MUSIC_WAIT_MS = 3500;
const SOUND_PREF = "hotte-revelation-son";

// Étapes : [instant en ms, étape]. « open » attend que le prénom soit arrivé.
const STEPS = [
  [300, 1],    // « Ho Ho Ho… »
  [1500, 2],   // « Quelqu'un attend un cadeau… »
  [3000, 3],   // le cadeau apparaît
  [4300, 4],   // « Es-tu prêt… »
  [5800, 5],   // il tremble plus fort
  [OPEN_AT, 6], // il s'ouvre : lumière, confettis
  [8700, 7],   // « TU DOIS OFFRIR UN CADEAU À… »
  [9500, 8],   // le prénom
  [10900, 9],  // « À toi de jouer ! »
  [11700, 10], // boutons
] as const;

type Receiver = { id: string; displayName: string; avatar: unknown };

function seeded(n: number, seed: number) {
  let x = seed;
  const r = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => [r(), r(), r(), r(), r()]);
}
const FLAKES = seeded(40, 11);
const STARS = seeded(26, 5);
const CONFETTI = seeded(80, 23);
const SPARKS = seeded(18, 77);
const COLORS = ["#e9677d", "#e3bd62", "#8db8ea", "#5aae86", "#ffffff", "#f39ab0"];

const music = (cmd: MusicCommand) => { window.dispatchEvent(new CustomEvent(MUSIC_EVENT, { detail: cmd })); };

function readSound(): boolean {
  try { return localStorage.getItem(SOUND_PREF) !== "off"; } catch { return true; }
}

export function SantaReveal({ eventId, eventName, onClose }: { eventId: string; eventName: string; onClose: () => void }) {
  const [run, setRun] = useState(0);
  const [step, setStep] = useState(0);
  const [started, setStarted] = useState(false); // la chorégraphie tourne
  const [receiver, setReceiver] = useState<Receiver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sound, setSound] = useState(readSound);
  const [musicNote, setMusicNote] = useState<string | null>(null);
  const t0 = useRef(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Le prénom, une seule fois par ouverture (même résultat à chaque relecture).
  useEffect(() => {
    let alive = true;
    revealMyReceiverAction(eventId).then((s) => {
      if (!alive) return;
      if (s.ok) setReceiver(s.data as Receiver); else setError(s.error ?? "Impossible de récupérer ton tirage.");
    }).catch(() => alive && setError("Connexion perdue. Réessaie dans un instant."));
    return () => { alive = false; };
  }, [eventId]);

  // Départ (et chaque « Revoir ») : on attend que la musique joue pour que
  // l'ouverture tombe sur le drop ; sans musique, départ immédiat.
  useEffect(() => {
    setStep(0); setStarted(false); setMusicNote(null);
    if (!sound) { t0.current = performance.now(); setStarted(true); return; }
    let done = false;
    const go = (note?: string) => {
      if (done) return;
      done = true;
      if (note) setMusicNote(note);
      t0.current = performance.now();
      setStarted(true);
    };
    const onState = (e: Event) => {
      const s = (e as CustomEvent<MusicState>).detail;
      if (s === "playing") go();
      else if (s === "unavailable" || s === "blocked") go("La musique n'a pas pu démarrer : l'animation continue sans elle.");
    };
    window.addEventListener(MUSIC_STATE_EVENT, onState);
    music({ type: "play-at", seconds: SONG_START_S });
    const t = setTimeout(() => go("La musique tarde à démarrer : l'animation continue sans attendre."), MUSIC_WAIT_MS);
    return () => { clearTimeout(t); window.removeEventListener(MUSIC_STATE_EVENT, onState); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Chorégraphie.
  useEffect(() => {
    if (!started) return;
    const timers = STEPS.map(([at, n]) => setTimeout(() => setStep((cur) => Math.max(cur, n)), at));
    return () => timers.forEach(clearTimeout);
  }, [started, run]);

  // On n'ouvre pas le cadeau tant que le prénom n'est pas arrivé.
  const shown = receiver || error ? step : Math.min(step, 5);

  useEffect(() => { if (shown >= 10) closeRef.current?.focus(); }, [shown]);

  const close = useCallback(() => { music("stop"); onClose(); }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Le lecteur s'arrête aussi si la page est quittée pendant l'animation.
  useEffect(() => () => { music("stop"); }, []);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem(SOUND_PREF, next ? "on" : "off"); } catch { /* ignoré */ }
    if (!next) { music("mute"); return; }
    // Reprise synchronisée : même position que si la musique n'avait jamais été coupée.
    const elapsed = started ? (performance.now() - t0.current) / 1000 : 0;
    music("unmute");
    music({ type: "play-at", seconds: SONG_START_S + elapsed });
  };

  const replay = () => {
    if (!sound) music("stop");
    setRun((r) => r + 1);
  };

  const skip = () => {
    // Passe directement à la révélation (sans rien changer au résultat).
    setStarted(true);
    setStep(9);
  };

  const name = receiver?.displayName ?? "";

  return createPortal(
    <div className="sr" role="dialog" aria-modal="true" aria-label={`Révélation du Secret Santa ${eventName}`}>
      <div className={`sr-stage s${shown}`} key={run}>
        <div className="sr-sky" aria-hidden="true">
          {STARS.map(([x, y, s, d], i) => (
            <span key={i} className="sr-star" style={{ left: `${x * 100}%`, top: `${y * 70}%`, ["--s" as string]: 1 + s * 2.4, animationDelay: `${-d * 3}s` }} />
          ))}
        </div>
        <div className="sr-snow" aria-hidden="true">
          {FLAKES.map(([x, sz, dur, d], i) => (
            <span key={i} style={{ left: `${x * 100}%`, width: 3 + sz * 6, height: 3 + sz * 6, animationDuration: `${5 + dur * 6}s`, animationDelay: `${-d * 10}s`, opacity: 0.45 + sz * 0.5 }} />
          ))}
        </div>

        <div className="sr-texts" aria-live="polite">
          {shown >= 1 && shown < 6 ? <p className="sr-t1">Ho Ho Ho... <span aria-hidden="true">🎅</span></p> : null}
          {shown >= 2 && shown < 6 ? <p className="sr-t2">Quelqu&apos;un attend un cadeau de ta part cette année...</p> : null}
          {shown >= 4 && shown < 6 ? <p className="sr-t3">Es-tu prêt à découvrir ton destinataire ?</p> : null}
        </div>

        {shown >= 3 ? (
          <div className={`sr-gift${shown >= 5 ? " strong" : ""}${shown >= 6 ? " open" : ""}`} aria-hidden="true">
            <div className="sr-rays" />
            {shown < 6 ? SPARKS.map(([x, d, s], i) => (
              <span key={i} className="sr-spark" style={{ left: `${10 + x * 80}%`, animationDelay: `${d * 2}s`, ["--s" as string]: 0.6 + s }} />
            )) : null}
            <svg viewBox="0 0 200 200" className="sr-giftsvg">
              <defs>
                <linearGradient id="srbox" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c8364d" /><stop offset="1" stopColor="#8f1d31" /></linearGradient>
                <linearGradient id="srlid" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#de4a62" /><stop offset="1" stopColor="#b52a42" /></linearGradient>
              </defs>
              <g className="sr-box">
                <rect x="38" y="92" width="124" height="96" rx="6" fill="url(#srbox)" />
                <rect x="91" y="92" width="18" height="96" fill="#e3bd62" />
                <rect x="38" y="92" width="124" height="10" fill="#000" opacity=".12" />
              </g>
              <g className="sr-lid">
                <rect x="30" y="70" width="140" height="28" rx="6" fill="url(#srlid)" />
                <rect x="91" y="70" width="18" height="28" fill="#f0cd78" />
                <path d="M100 70 C 78 40, 52 52, 70 66 C 80 72, 92 70, 100 70 C 108 70, 120 72, 130 66 C 148 52, 122 40, 100 70 Z" fill="#e3bd62" stroke="#b88a2c" strokeWidth="2" />
                <circle cx="100" cy="68" r="7" fill="#f0cd78" stroke="#b88a2c" strokeWidth="2" />
              </g>
            </svg>
          </div>
        ) : null}

        {shown >= 6 ? (
          <>
            <div className="sr-flash" aria-hidden="true" />
            <div className="sr-confetti" aria-hidden="true">
              {CONFETTI.map(([x, d, r, c, w], i) => (
                <span key={i} style={{
                  left: `${x * 100}%`, background: COLORS[Math.floor(c * COLORS.length)], animationDelay: `${d * 0.9}s`,
                  ["--r" as string]: `${r * 720 - 360}deg`, ["--dx" as string]: `${(w - 0.5) * 160}px`, width: 6 + w * 6, height: 10 + r * 8,
                }} />
              ))}
            </div>
          </>
        ) : null}

        {shown >= 7 ? (
          <div className="sr-result">
            {error ? <p className="sr-error" role="alert">{error}</p> : (
              <>
                <p className="sr-lead">🎉 TU DOIS OFFRIR UN CADEAU À... 🎉</p>
                {shown >= 8 && receiver ? (
                  <div className="sr-who">
                    <span className="sr-ring"><Avatar avatar={receiver.avatar} size={112} /></span>
                    <p className="sr-name" aria-label={name}>
                      {[...name].map((c, i) => <span key={i} aria-hidden="true" style={{ animationDelay: `${i * 0.06}s` }}>{c === " " ? " " : c}</span>)}
                      <span aria-hidden="true">&nbsp;!</span>
                    </p>
                  </div>
                ) : null}
                {shown >= 9 ? <p className="sr-final">À toi de jouer ! Prépare-lui une belle surprise et surtout... garde le secret ! <span aria-hidden="true">🤫🎁</span></p> : null}
              </>
            )}
            {shown >= 10 || error ? (
              <div className="sr-actions">
                <button type="button" className="btn gold" onClick={replay} disabled={!!error}>Revoir l&apos;animation <span aria-hidden="true">🎁</span></button>
                <button type="button" className="btn sr-light" onClick={close} ref={closeRef}>Retourner à mon espace</button>
                {receiver ? <Link className="btn ghost sr-ghost" href={`/famille?membre=${receiver.id}`} onClick={() => music("stop")}>Voir sa liste de Noël</Link> : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="sr-controls">
        <button type="button" className="sr-icon" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? "Couper le son" : "Activer le son"} title={sound ? "Couper le son" : "Activer le son"}>
          <span aria-hidden="true">{sound ? "🔊" : "🔇"}</span>
        </button>
        {shown < 8 ? <button type="button" className="sr-icon sr-skip" onClick={skip}>Passer</button> : null}
        <button type="button" className="sr-icon" onClick={close} aria-label="Fermer">✕</button>
      </div>
      {!started ? <p className="sr-wait" role="status">Préparation de la surprise…</p> : null}
      {musicNote && shown < 6 ? <p className="sr-note" role="status">{musicNote}</p> : null}
    </div>,
    document.body,
  );
}

/** Bouton d'ouverture + animation. Après fermeture, la page se recharge
 * côté serveur pour afficher le destinataire découvert. */
export function RevealLauncher({ eventId, eventName, seen }: { eventId: string; eventName: string; seen: boolean }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className={seen ? "btn gold" : "btn sr-launch"} onClick={() => setOpen(true)}>
        {seen ? <>Revoir l&apos;animation <span aria-hidden="true">🎁</span></> : <><span aria-hidden="true">🎁</span> Découvrir mon Secret Santa</>}
      </button>
      {open ? <SantaReveal eventId={eventId} eventName={eventName} onClose={() => { setOpen(false); router.refresh(); }} /> : null}
    </>
  );
}
