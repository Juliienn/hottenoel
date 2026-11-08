import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { daysUntilChristmas } from "@/lib/parisTime";
import { FooterScene, Garland, SkySleigh, Tree } from "@/components/Decorations";
import { MusicPlayer } from "@/components/MusicPlayer";
import { Snow, SnowToggle } from "@/components/Snow";
import { Intro, INTRO_HEAD_SCRIPT } from "@/components/Intro";

export const metadata: Metadata = {
  title: { default: "La Hotte familiale", template: "%s · La Hotte familiale" },
  description: "Les listes de Noël de la famille.",
  // Site familial privé : rien à indexer.
  robots: { index: false, follow: false },
};

// Le compte à rebours dépend du jour : aucune page n'est figée au build.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const days = daysUntilChristmas();
  return (
    // data-intro est posé par le script ci-dessous avant l'hydratation.
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Masque l'écran d'accueil avant le premier affichage s'il a déjà été vu dans cet onglet. */}
        <script dangerouslySetInnerHTML={{ __html: INTRO_HEAD_SCRIPT }} />
        <noscript><style>{".intro{display:none!important}"}</style></noscript>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap" />
      </head>
      <body>
        <Snow />
        <div className="page">
          <div className="wrap">
            <header className="top">
              <Garland />
              <SkySleigh />
              <div>
                <h1><Link href="/ma-liste">La Hotte familiale</Link></h1>
                <p>Chacun écrit sa liste. Les autres choisissent ce qu&apos;ils offrent, sans doublon et sans gâcher la surprise.</p>
              </div>
              <div className="top-right">
                <Tree />
                <div className="countdown" aria-live="polite">
                  {days === 0 ? <><b>Joyeux Noël</b><span>c&apos;est aujourd&apos;hui</span></> : <><b>J-{days}</b><span>avant le 25 décembre</span></>}
                </div>
              </div>
            </header>
            {children}
          </div>
        </div>
        <FooterScene />
        <footer className="site-foot">
          La Hotte familiale · site privé de la famille · <SnowToggle />
        </footer>
        <MusicPlayer />
        <Intro days={days} />
      </body>
    </html>
  );
}
