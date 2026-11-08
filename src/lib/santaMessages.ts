// Textes proposés à l'Hôte pour prévenir les participants d'un Secret Santa.
// Purs (aucun accès à la base) : utilisés par le serveur pour préremplir
// l'aperçu, que l'Hôte peut ensuite modifier. Le message « tirage » ne reçoit
// AUCUNE attribution en paramètre : il ne peut pas en contenir.
import { budgetLabel } from "./format";
import { formatDayFr } from "./parisTime";

export const SANTA_MESSAGE_MAX = 1000;

type EventInfo = { id: string; name: string; drawDate: string; giftDate: string; budgetCents: number | null; budgetKind: string };

const eventUrl = (siteUrl: string, id: string) => `${siteUrl}/secret-santa/${id}`;

export function announceMessage(ev: EventInfo, participantNames: string[], siteUrl: string): string {
  return [
    "Ho Ho Ho ! 🎅🎄",
    `Un Secret Santa vient d'être organisé pour ${ev.name} !`,
    "Voici les informations importantes :",
    `🎁 Événement : ${ev.name}`,
    `📅 Date du tirage : ${formatDayFr(ev.drawDate)}`,
    `🎄 Date de remise des cadeaux : ${formatDayFr(ev.giftDate)}`,
    `💰 Budget : ${budgetLabel(ev.budgetCents, ev.budgetKind)}`,
    "Participants :",
    ...participantNames.map((n) => `• ${n}`),
    "Préparez-vous à faire plaisir à quelqu'un ! Le tirage approche... 🤫",
    `👉 ${eventUrl(siteUrl, ev.id)}`,
    "À très bientôt !",
  ].join("\n");
}

export function drawMessage(ev: Pick<EventInfo, "id" | "name">, siteUrl: string): string {
  return [
    "HO HO HO ! 🎅🎄",
    `Le tirage au sort du Secret Santa ${ev.name} vient d'être effectué !`,
    "Le suspense est terminé... ou presque ! 🤫",
    "Rendez-vous dès maintenant sur le site familial pour découvrir la personne à qui vous devrez préparer un cadeau :",
    `👉 ${eventUrl(siteUrl, ev.id)}`,
    "Gardez bien votre tirage secret et ne dévoilez surtout pas votre destinataire !",
    "Que la magie de Noël commence ! 🎁",
  ].join("\n");
}
