// Avatars dessinés, repris de la première version du site.
// On ne stocke que des clés ; couleurs et tracés viennent de ces tables, donc
// une valeur inconnue en base retombe sur le défaut au lieu d'entrer dans le SVG
// (le SVG est injecté tel quel dans la page : aucune donnée libre n'y entre).

export const AV = {
  sex: [["f", "Femme"], ["h", "Homme"]],
  hair: [["court", "Court"], ["raie", "Raie sur le côté"], ["herisse", "En pétard"], ["boucles", "Bouclés"],
    ["carre", "Carré"], ["long", "Longs"], ["queue", "Queue de cheval"], ["chignon", "Chignon"], ["chauve", "Sans cheveux"]],
  skin: [["tres-claire", "Très claire", "#f9dcc4"], ["claire", "Claire", "#f1c6a0"], ["mate", "Mate", "#dca27a"],
    ["halee", "Hâlée", "#b97c55"], ["brune", "Brune", "#8d5a3b"], ["foncee", "Foncée", "#5e3b26"]],
  hairColor: [["noir", "Noirs", "#1f1a17"], ["brun", "Bruns", "#4a2f1f"], ["chatain", "Châtains", "#7a4f2c"],
    ["blond", "Blonds", "#d8b46a"], ["roux", "Roux", "#b5502a"], ["gris", "Gris", "#9a9a9a"], ["blanc", "Blancs", "#ece8df"]],
  eyes: [["marron", "Marron", "#6b3f1f"], ["noisette", "Noisette", "#8e6b2f"], ["vert", "Verts", "#4f7d3a"],
    ["bleu", "Bleus", "#3b74b8"], ["gris", "Gris", "#7c8a95"], ["noir", "Noirs", "#2a1d17"]],
  // 4e valeur : couleur du zigzag, foncée sur les pulls clairs pour rester visible.
  sweater: [["rouge", "Rouge", "#b8323f", "#ffffff"], ["bordeaux", "Bordeaux", "#6e1f2d", "#f3d9a4"],
    ["vert", "Vert sapin", "#1f5a43", "#ffffff"], ["bleu", "Bleu nuit", "#23395d", "#ffffff"],
    ["moutarde", "Moutarde", "#c9952b", "#4a2f1f"], ["rose", "Rose", "#d9738c", "#ffffff"],
    ["gris", "Gris chiné", "#8a8f93", "#ffffff"], ["blanc", "Blanc cassé", "#efe9dc", "#b8323f"]],
} as const;

export type AvatarKey = keyof typeof AV;
export type Avatar = Record<AvatarKey, string>;

export const AV_DEFAULT: Avatar = { sex: "f", hair: "long", skin: "claire", hairColor: "chatain", eyes: "marron", sweater: "rouge" };

export function normalizeAvatar(raw: unknown): Avatar {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = {} as Avatar;
  for (const k of Object.keys(AV_DEFAULT) as AvatarKey[]) {
    const v = a[k];
    out[k] = (AV[k] as readonly (readonly string[])[]).some((x) => x[0] === v) ? (v as string) : AV_DEFAULT[k];
  }
  return out;
}

const pick = (list: readonly (readonly string[])[], key: string) => (list.find((x) => x[0] === key) || list[0]);

const CAP_SLICK = "M28 48 Q26 20 50 20 Q74 20 72 48 Q68 30 50 28 Q32 30 28 48 Z";
const HAIR: Record<string, { front?: string; back?: string; curls?: boolean }> = {
  court: { front: "M28 48 Q25 20 50 19 Q75 20 72 48 Q70 34 60 31 Q52 35 44 31 Q32 33 28 48 Z" },
  raie: { front: "M28 50 Q25 19 52 19 Q76 21 72 50 Q71 36 64 30 Q48 40 30 40 Q28 44 28 50 Z" },
  herisse: { front: "M28 46 L27 30 L33 33 L35 20 L42 27 L47 16 L52 26 L58 17 L62 28 L69 22 L68 33 L73 31 L72 46 Q66 34 50 33 Q34 34 28 46 Z" },
  boucles: { front: "M27 48 Q25 20 50 20 Q75 20 73 48 Q66 34 50 33 Q34 34 27 48 Z", curls: true },
  carre: {
    back: "M24 50 Q22 18 50 17 Q78 18 76 50 L78 76 Q70 80 64 74 L36 74 Q30 80 22 76 Z",
    front: "M27 48 Q25 18 50 18 Q75 18 73 48 Q72 40 70 38 L30 38 Q28 40 27 48 Z",
  },
  long: {
    back: "M24 50 Q21 17 50 16 Q79 17 76 50 Q78 72 82 90 Q66 96 50 92 Q34 96 18 90 Q22 72 24 50 Z",
    front: "M28 54 Q24 19 50 19 Q76 19 72 54 Q70 36 56 28 Q52 26 50 30 Q48 26 44 28 Q30 36 28 54 Z",
  },
  queue: { back: "M66 26 Q92 30 86 66 Q84 74 78 78 Q82 60 72 40 Z", front: CAP_SLICK },
  chignon: { back: "M50 25 m-10 -9 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", front: CAP_SLICK },
  chauve: {},
};
const HEAD: Record<string, string> = {
  f: "M29 48 Q29 24 50 24 Q71 24 71 48 Q70 68 58 76 Q50 80 42 76 Q30 68 29 48 Z",
  h: "M28 48 Q28 24 50 24 Q72 24 72 48 Q72 66 62 74 Q50 80 38 74 Q28 66 28 48 Z",
};

/** SVG de l'avatar, sans balise englobante de taille (cf. composant Avatar). */
export function avatarSvg(raw: unknown): string {
  const a = normalizeAvatar(raw);
  const skin = pick(AV.skin, a.skin)[2], hc = pick(AV.hairColor, a.hairColor)[2], eye = pick(AV.eyes, a.eyes)[2];
  const sw = pick(AV.sweater, a.sweater);
  const O = "#2b2118";
  const st = `stroke="${O}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;
  const h = HAIR[a.hair] ?? {};
  const brow = a.hair === "chauve" ? "#4a2f1f" : hc;
  let curls = "";
  if (h.curls) {
    for (let i = 0; i <= 8; i++) {
      const t = (Math.PI * (10 + i * 20)) / 180;
      curls += `<circle cx="${(50 + 23 * Math.cos(t)).toFixed(1)}" cy="${(44 - 22 * Math.sin(t)).toFixed(1)}" r="7" fill="${hc}" ${st}/>`;
    }
  }
  const eyeAt = (x: number) => `<ellipse cx="${x}" cy="51" rx="4.2" ry="4.6" fill="#fff" ${st} stroke-width="1.6"/>`
    + `<circle cx="${x}" cy="51.6" r="2.8" fill="${eye}"/><circle cx="${x}" cy="51.6" r="1.3" fill="#1a120d"/>`
    + `<circle cx="${x + 0.9}" cy="50.6" r="0.7" fill="#fff"/>`;
  const lashes = a.sex === "f"
    ? `<path d="M37.5 47.5 l-2.2 -1.8 M39.5 46.6 l-1.2 -2.4 M62.5 47.5 l2.2 -1.8 M60.5 46.6 l1.2 -2.4" fill="none" ${st} stroke-width="1.4"/>` : "";
  return `<svg viewBox="0 0 100 100" aria-hidden="true">`
    + `<circle cx="50" cy="50" r="50" fill="#dce8e2"/>`
    + `<path d="M12 104 Q14 85 36 81 Q50 88 64 81 Q86 85 88 104 Z" fill="${sw[2]}" ${st}/>`
    + `<path d="M20 97 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4 l5 4 l5 -4" fill="none" stroke="${sw[3]}" stroke-width="1.6" stroke-linejoin="round"/>`
    + (h.back ? `<path d="${h.back}" fill="${hc}" ${st}/>` : "")
    + `<path d="M43 70 L43 82 Q50 86 57 82 L57 70 Z" fill="${skin}" ${st}/>`
    + `<circle cx="29" cy="53" r="5" fill="${skin}" ${st}/><circle cx="71" cy="53" r="5" fill="${skin}" ${st}/>`
    + `<path d="${HEAD[a.sex]}" fill="${skin}" ${st}/>`
    + (h.front ? `<path d="${h.front}" fill="${hc}" ${st}/>` : "") + curls
    + `<path d="M36 43 Q41 40 46 42.5 M54 42.5 Q59 40 64 43" fill="none" stroke="${brow}" stroke-width="2.4" stroke-linecap="round"/>`
    + eyeAt(41) + eyeAt(59) + lashes
    + `<path d="M50 55 Q48 61 51 62" fill="none" ${st} stroke-width="1.6"/>`
    + `<circle cx="37" cy="61" r="3.6" fill="#e2766f" opacity=".3"/><circle cx="63" cy="61" r="3.6" fill="#e2766f" opacity=".3"/>`
    + `<path d="M44 66 Q50 71.5 56 66" fill="none" stroke="${a.sex === "f" ? "#a8424f" : O}" stroke-width="2" stroke-linecap="round"/>`
    + `</svg>`;
}
