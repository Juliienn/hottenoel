// Logo de l'appli : un H formé de deux sapins, la guirlande en guise de barre.
// Mêmes tracés que src/app/icon.svg et les icônes d'appli (public/icons).
// Couleurs prises dans les variables du thème : suit le mode clair/sombre.
const TREE = "M0 0 L12 26 H-12Z M0 14 L16 46 H-16Z M0 31 L20 69 H-20Z";

export function Logo({ className = "logo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      {[28, 72].map((x) => (
        <g key={x}>
          <rect x={x - 4} y={79} width={8} height={11} rx={1.5} fill="var(--kraft-muted)" />
          <path d={TREE} transform={`translate(${x} 12)`} fill="var(--fir)" />
        </g>
      ))}
      <path d="M20 49 Q50 72 80 49" fill="none" stroke="var(--gold)" strokeWidth={3.4} strokeLinecap="round" />
      {[[36, 57, "var(--berry)"], [50, 60.5, "var(--paper)"], [64, 57, "var(--berry)"]].map(([x, y, c]) => (
        <g key={x}>
          <path d={`M${x} ${y} V${Number(y) + 3}`} stroke="var(--gold)" strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={x} cy={Number(y) + 6.5} r={4.2} fill={String(c)} stroke="var(--gold)" strokeWidth={0.8} />
        </g>
      ))}
      <polygon points="72,1.5 73.98,6.27 79.13,6.68 75.21,10.04 76.41,15.07 72,12.38 67.59,15.07 68.79,10.04 64.87,6.68 70.02,6.27" fill="var(--gold)" />
    </svg>
  );
}
