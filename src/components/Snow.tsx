"use client";

import { useEffect, useRef, useState } from "react";

// Neige discrète derrière le contenu (z-index 0, pointer-events: none) :
// les cartes opaques la masquent, elle ne se voit que dans les marges.
// Désactivée par défaut si le système demande moins d'animations ; le
// bouton du pied de page la coupe ou la rallume (préférence mémorisée).
const KEY = "hotte-neige";
const EVENT = "hotte-neige";

function readPref(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "on") return true;
    if (v === "off") return false;
  } catch { /* stockage indisponible */ }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function Snow() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(readPref());
    const onToggle = () => setOn(readPref());
    window.addEventListener(EVENT, onToggle);
    return () => window.removeEventListener(EVENT, onToggle);
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!on || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let color = getComputedStyle(document.documentElement).getPropertyValue("--snow").trim() || "#a9bfcc";
    type Flake = { x: number; y: number; r: number; vy: number; phase: number; amp: number };
    let flakes: Flake[] = [];
    const make = (y?: number): Flake => ({
      x: Math.random() * w, y: y ?? Math.random() * h, r: 0.8 + Math.random() * 2.6,
      vy: 0.25 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2, amp: 0.3 + Math.random() * 0.6,
    });
    const resize = () => {
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(90, Math.round(w / 14));
      flakes = Array.from({ length: count }, () => make());
    };
    const drawFlake = (f: Flake) => {
      if (f.r < 2.2) { ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); return; }
      // Les plus gros flocons ont six branches.
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + f.phase;
        ctx.moveTo(f.x, f.y);
        ctx.lineTo(f.x + Math.cos(a) * f.r * 1.6, f.y + Math.sin(a) * f.r * 1.6);
      }
      ctx.stroke();
    };
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
      for (const f of flakes) {
        f.y += f.vy; f.phase += 0.01; f.x += Math.sin(f.phase) * f.amp * 0.4;
        if (f.y > h + 6) Object.assign(f, make(-6));
        drawFlake(f);
      }
      raf = requestAnimationFrame(tick);
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => { color = getComputedStyle(document.documentElement).getPropertyValue("--snow").trim() || color; };
    // Onglet caché : on arrête l'animation pour ne pas consommer de batterie.
    const onVisibility = () => { cancelAnimationFrame(raf); if (!document.hidden) raf = requestAnimationFrame(tick); };
    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    mq.addEventListener("change", onScheme);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      mq.removeEventListener("change", onScheme);
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.clearRect(0, 0, w, h);
    };
  }, [on]);

  return <canvas ref={ref} className="snow" aria-hidden="true" hidden={!on} />;
}

export function SnowToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    setOn(readPref());
    const sync = () => setOn(readPref());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);
  if (on === null) return null;
  return (
    <button type="button" className="linkbtn" onClick={() => {
      try { localStorage.setItem(KEY, on ? "off" : "on"); } catch { /* ignoré */ }
      window.dispatchEvent(new Event(EVENT));
    }}>
      {on ? "Arrêter la neige" : "Faire tomber la neige"}
    </button>
  );
}
