// Numéros de portable : saisis librement (« 06 12 34 56 78 », « +33 6… »),
// stockés au format international E.164 (« +33612345678 »).

/** Renvoie le numéro normalisé, null si vide, ou lève une erreur lisible. */
export function normalizePhone(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/[^\d\s.+()-]/.test(s)) throw new Error("Numéro de téléphone invalide : chiffres, espaces, points ou tirets uniquement.");
  let digits = s.replace(/[\s.()-]/g, "");
  if (digits.startsWith("00")) digits = "+" + digits.slice(2);
  // Numéro français à 10 chiffres : 06 12 34 56 78 → +33612345678.
  if (/^0[1-9]\d{8}$/.test(digits)) digits = "+33" + digits.slice(1);
  // +33 0 6… (zéro en trop après l'indicatif, fréquent).
  digits = digits.replace(/^\+330(?=[1-9]\d{8}$)/, "+33");
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) {
    throw new Error("Numéro de téléphone invalide. Exemples : 06 12 34 56 78 ou +33 6 12 34 56 78.");
  }
  return digits;
}

/** Affichage lisible : +33 6 12 34 56 78 pour la France, brut sinon. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const fr = /^\+33([1-9])(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  return fr ? `+33 ${fr.slice(1).join(" ")}` : e164;
}
