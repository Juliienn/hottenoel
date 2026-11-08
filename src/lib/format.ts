const euroFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export const euro = (cents: number) => euroFmt.format(cents / 100);
export const fmtPrice = (cents: number | null) => (cents == null ? "Prix libre" : euro(cents));

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "lien"; }
}

/** Ne laisse passer que http(s) : jamais de javascript: dans un href. */
export function safeHref(url: string): string | null {
  try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}

export const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Budget d'un Secret Santa, en clair. */
export function budgetLabel(cents: number | null, kind: string): string {
  if (cents == null) return "Pas de budget fixé";
  const v = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
  return kind === "MAX" ? `${v} maximum` : `Environ ${v}`;
}
