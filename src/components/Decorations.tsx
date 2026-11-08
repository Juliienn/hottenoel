// Décorations de Noël, toutes dessinées au trait dans les couleurs du site
// (currentColor + variables CSS) : elles suivent le thème clair/sombre et
// restent cohérentes entre elles. Purement décoratives : aria-hidden, et
// pointer-events: none dans le CSS pour ne jamais gêner un clic.

const BULBS = ["var(--berry)", "var(--gold)", "var(--ice)", "var(--fir)"];

/** Guirlande lumineuse en haut de page : une suite de festons identiques. */
export function Garland() {
  return (
    <div className="garland" aria-hidden="true">
      {Array.from({ length: 20 }, (_, i) => (
        <svg key={i} viewBox="0 0 120 34">
          <path d="M0 3 Q60 26 120 3" fill="none" stroke="var(--muted)" strokeWidth="1.2" opacity=".7" />
          {[[22, 11.5], [46, 16.6], [74, 16.6], [98, 11.5]].map(([x, y], j) => (
            <g key={j} className="bulb">
              <rect x={x - 2} y={y - 1} width="4" height="3" rx="1" fill="var(--muted)" />
              <ellipse cx={x} cy={y + 6} rx="3.6" ry="5" fill={BULBS[(i + j) % 4]} />
              <ellipse cx={x - 1.1} cy={y + 4.4} rx="1" ry="1.6" fill="#fff" opacity=".55" />
            </g>
          ))}
        </svg>
      ))}
    </div>
  );
}

const STAR = "M0 -6 L1.7 -1.8 L6 -1.8 L2.6 1 L3.8 5.4 L0 2.8 L-3.8 5.4 L-2.6 1 L-6 -1.8 L-1.7 -1.8 Z";

/** Sapin décoré d'une étoile et de boules. */
export function Tree({ className = "deco-tree" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 46 60" aria-hidden="true">
      <path d="M23 6 L35 22 L29 22 L39 36 L32 36 L43 51 L3 51 L14 36 L7 36 L17 22 L11 22 Z" fill="currentColor" />
      <path d="M14 36 Q23 40 32 36 M17 22 Q23 25 29 22" fill="none" stroke="var(--snow)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="20" y="51" width="6" height="7" fill="var(--kraft-muted)" />
      <path d={STAR} transform="translate(23 6)" fill="var(--gold)" />
      <circle cx="18" cy="30" r="2" fill="var(--berry)" /><circle cx="28" cy="43" r="2" fill="var(--gold)" />
      <circle cx="16" cy="45" r="2" fill="var(--ice)" /><circle cx="27" cy="29" r="1.6" fill="var(--gold)" />
    </svg>
  );
}

function Reindeer({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="22" cy="18" rx="12" ry="6" fill="currentColor" fillOpacity=".15" />
      <path d="M32 15 L38 7" />
      <ellipse cx="40.5" cy="6" rx="4" ry="2.7" transform="rotate(-15 40.5 6)" fill="currentColor" fillOpacity=".15" />
      <path d="M38.5 3.5 L36.5 -1.5 M37.2 0.6 L34 -1 M41 3.4 L42 -1.6 M41.6 0.4 L45 -1.2" />
      <path d="M14 23 L10 31 M18 24 L18 32 M27 23 L31 31 M31 22 L36 29" />
      <path d="M10 16 L6 13" />
      <circle cx="44.6" cy="7" r="1.1" fill="var(--berry)" stroke="none" />
    </g>
  );
}

/** Traîneau tiré par deux rennes, qui flotte doucement dans le ciel de l'en-tête. */
export function SkySleigh({ className = "sky-sleigh" }: { className?: string }) {
  return (
    <svg className={className} viewBox="-4 -6 200 50" aria-hidden="true">
      <path d="M44 24 L96 20 M44 26 L150 18" fill="none" stroke="currentColor" strokeWidth="1" opacity=".7" />
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12 L8 26 Q9 30 14 30 L38 30 Q44 30 44 22 L44 16" fill="var(--berry)" fillOpacity=".85" />
        <path d="M0 36 L40 36 Q48 36 48 28" />
        <path d="M12 30 L12 36 M34 30 L34 36" />
        <circle cx="22" cy="10" r="7" fill="var(--kraft-muted)" fillOpacity=".7" />
        <path d="M18 4 Q22 0 26 4" />
      </g>
      <Reindeer x={92} y={8} />
      <Reindeer x={146} y={2} />
      <path d={STAR} transform="translate(188 30) scale(.6)" fill="var(--gold)" />
    </svg>
  );
}

function Gift({ x, y, w, h, color, ribbon }: { x: number; y: number; w: number; h: number; color: string; ribbon: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="1.5" fill={color} />
      <rect x={x + w / 2 - 2} y={y} width="4" height={h} fill={ribbon} />
      <rect x={x} y={y + h * 0.35} width={w} height="3.5" fill={ribbon} opacity=".9" />
      <path d={`M${x + w / 2} ${y} q-7 -8 -9 -2 q3 4 9 2 q7 -8 9 -2 q-3 4 -9 2`} fill="none" stroke={ribbon} strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

/** Scène de pied de page : colline enneigée, sapins, cadeaux et étoiles. */
export function FooterScene({ className = "footer-scene" }: { className?: string }) {
  const trees: Array<[number, number]> = [[40, .8], [120, 1.1], [520, 1.35], [600, .95], [990, 1.05], [1080, .75], [1150, .9]];
  const stars: Array<[number, number, number]> = [[200, 30, .7], [330, 18, .5], [420, 44, .6], [760, 22, .8], [880, 40, .5], [1010, 16, .6], [700, 52, .4]];
  return (
    <div className={className} aria-hidden="true">
      <svg viewBox="0 0 1200 150" preserveAspectRatio="xMidYMax slice">
        {stars.map(([x, y, s], i) => <path key={i} d={STAR} transform={`translate(${x} ${y}) scale(${s})`} fill="var(--gold)" opacity=".8" />)}
        <path d="M0 128 Q200 102 420 118 Q640 134 860 112 Q1040 96 1200 116 L1200 150 L0 150 Z" fill="var(--paper)" stroke="var(--line)" strokeWidth="1.5" />
        {trees.map(([x, s], i) => (
          <g key={i} transform={`translate(${x} ${122 - 58 * s}) scale(${s})`} color="var(--fir)">
            <path d="M23 6 L35 22 L29 22 L39 36 L32 36 L43 51 L3 51 L14 36 L7 36 L17 22 L11 22 Z" fill="currentColor" />
            <path d="M14 36 Q23 40 32 36 M17 22 Q23 25 29 22" fill="none" stroke="var(--snow)" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="20" y="51" width="6" height="7" fill="var(--kraft-muted)" />
            {i === 2 ? <path d={STAR} transform="translate(23 6)" fill="var(--gold)" /> : null}
          </g>
        ))}
        <Gift x={590} y={108} w={24} h={18} color="var(--berry)" ribbon="var(--gold)" />
        <Gift x={620} y={113} w={18} h={13} color="var(--fir)" ribbon="var(--kraft)" />
        <Gift x={498} y={110} w={20} h={16} color="var(--gold)" ribbon="var(--berry)" />
        <Gift x={1040} y={106} w={22} h={17} color="var(--ice)" ribbon="var(--kraft)" />
      </svg>
    </div>
  );
}

/** Petite boule de Noël suspendue, pour les cartes d'événement. */
export function Ornament() {
  return (
    <svg className="ornament" viewBox="0 0 26 40" aria-hidden="true">
      <path d="M13 0 L13 10" stroke="var(--muted)" strokeWidth="1" />
      <rect x="9.5" y="9" width="7" height="5" rx="1" fill="var(--gold)" />
      <circle cx="13" cy="25" r="11" fill="currentColor" />
      <path d="M4 22 Q13 27 22 22" fill="none" stroke="#fff" strokeWidth="1.4" opacity=".7" />
      <ellipse cx="9" cy="20" rx="2.2" ry="3.2" fill="#fff" opacity=".35" />
    </svg>
  );
}
