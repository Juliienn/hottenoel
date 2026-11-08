// Messages de l'Hôte aux participants d'un Secret Santa.
// Destinataires = participants de CET événement, relus en base à l'envoi :
// jamais toute la famille, jamais une liste fournie par le navigateur.
import type { SantaMessageKind } from "@prisma/client";
import { prisma } from "../prisma";
import type { SessionUser } from "../auth/core";
import { SANTA_MESSAGE_MAX } from "../santaMessages";
import { AppError, invalid, notFound } from "./errors";
import { assertHost, assertReady } from "./guards";
import { sendMemberSms, smsProvider } from "./sms";

export type SmsResult = { name: string; status: "sent" | "failed" | "no_phone"; detail?: string };

/** Participants à prévenir (l'Hôte lui-même exclu des SMS : il écrit le message). */
export async function messageRecipients(actor: SessionUser, eventId: string) {
  assertHost(actor); assertReady(actor);
  const ev = await prisma.santaEvent.findUnique({
    where: { id: eventId },
    select: { participants: { select: { user: { select: { id: true, displayName: true, phone: true } } } } },
  });
  if (!ev) throw notFound("Événement");
  return ev.participants
    .map((p) => p.user)
    .filter((u) => u.id !== actor.id)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
}

export async function sendSantaMessage(actor: SessionUser, eventId: string, kind: SantaMessageKind, rawText: string, viaSms: boolean) {
  assertHost(actor); assertReady(actor);
  const ev = await prisma.santaEvent.findUnique({ where: { id: eventId }, select: { id: true, status: true, _count: { select: { participants: true } } } });
  if (!ev) throw notFound("Événement");
  if (kind === "TIRAGE" && ev.status !== "DRAWN") throw new AppError("CONFLICT", "Le tirage n'a pas encore eu lieu.");
  if (ev._count.participants === 0) throw invalid("Cet événement n'a aucun participant à prévenir.");
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) throw invalid("Le message est vide.");
  if (text.length > SANTA_MESSAGE_MAX) throw invalid(`Le message fait au plus ${SANTA_MESSAGE_MAX} caractères.`);
  if (viaSms && !smsProvider()) throw invalid("Aucun service d'envoi de SMS n'est configuré sur le serveur.");

  // Publié sur le site : visible des seuls participants (cf. eventMessages).
  const message = await prisma.santaMessage.create({
    data: { eventId, kind, text, seen: { create: { userId: actor.id } } },
    select: { id: true },
  });

  const recipients = await messageRecipients(actor, eventId);
  const sms: SmsResult[] = [];
  if (viaSms) {
    for (const r of recipients) {
      if (!r.phone) { sms.push({ name: r.displayName, status: "no_phone" }); continue; }
      try {
        await sendMemberSms(actor, r.id, text);
        sms.push({ name: r.displayName, status: "sent" });
      } catch (e) {
        sms.push({ name: r.displayName, status: "failed", detail: e instanceof AppError ? e.message : undefined });
      }
    }
  }
  return { messageId: message.id, published: recipients.length, sms };
}

/** Messages d'un événement, pour un participant ou l'Hôte ; marque lus ceux
 * qu'il n'avait pas vus. L'appelant a déjà vérifié l'accès à l'événement. */
export async function eventMessages(actor: SessionUser, eventId: string) {
  const rows = await prisma.santaMessage.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, text: true, createdAt: true, seen: { where: { userId: actor.id }, select: { userId: true } } },
  });
  const unseen = rows.filter((r) => r.seen.length === 0).map((r) => ({ messageId: r.id, userId: actor.id }));
  if (unseen.length) await prisma.santaMessageSeen.createMany({ data: unseen, skipDuplicates: true });
  return rows.map(({ seen, ...r }) => ({ ...r, isNew: seen.length === 0 }));
}

/** Messages non lus de l'utilisateur, pour le bandeau du site : seulement
 * ceux des événements dont il est participant. */
export async function unreadSantaMessages(actor: SessionUser) {
  if (actor.mustChangePassword) return [];
  const rows = await prisma.santaMessage.findMany({
    where: { event: { participants: { some: { userId: actor.id } } }, seen: { none: { userId: actor.id } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, event: { select: { id: true, name: true } } },
    take: 5,
  });
  return rows.map((r) => ({ id: r.id, kind: r.kind, eventId: r.event.id, eventName: r.event.name }));
}
