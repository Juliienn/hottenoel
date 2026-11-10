import type { MetadataRoute } from "next";

// Ajout à l'écran d'accueil (Android/Chrome ; iOS lit surtout apple-icon.png
// et les balises appleWebApp de layout.tsx) : s'ouvre comme une appli.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "La Hotte familiale",
    short_name: "La Hotte",
    description: "Les listes de Noël de la famille.",
    start_url: "/ma-liste",
    display: "standalone",
    background_color: "#eef2f0",
    theme_color: "#eef2f0",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
