// Toutes les dates du site sont des journées en heure de Paris ("AAAA-MM-JJ"),
// jamais le fuseau du serveur (UTC sur Vercel) ni celui du navigateur.

export function parisDayKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isDayKey(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Nombre de jours de `from` à `to` (journées, arithmétique de calendrier). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (k: string) => { const [y, m, d] = k.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function formatDayFr(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  // Midi UTC : la même journée quel que soit le fuseau d'affichage.
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export function daysUntilChristmas(today: string = parisDayKey()): number {
  const year = Number(today.slice(0, 4));
  let xmas = `${year}-12-25`;
  if (daysBetween(today, xmas) < 0) xmas = `${year + 1}-12-25`;
  return daysBetween(today, xmas);
}
