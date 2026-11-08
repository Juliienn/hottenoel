// Envoi des accès par SMS. Deux chemins :
//  - sur smartphone (ou Mac avec Messages), un lien sms: ouvre l'application
//    de messagerie, message prérempli : c'est l'Hôte qui appuie sur Envoyer ;
//  - si un fournisseur est configuré (variables d'environnement), le serveur
//    envoie lui-même le SMS, depuis n'importe quel appareil.
// Le numéro de destination est TOUJOURS relu en base : l'action ne peut pas
// servir à écrire à un numéro arbitraire.
import { prisma } from "../prisma";
import type { SessionUser } from "../auth/core";
import { AppError, invalid, notFound } from "./errors";
import { assertHost, assertReady } from "./guards";
import { DEFAULT_SMS_TEMPLATE, SMS_MAX, SMS_TEMPLATE_MAX } from "../smsTemplate";

const TEMPLATE_KEY = "smsTemplate";

export async function getSmsTemplate(actor: SessionUser): Promise<string> {
  assertHost(actor); assertReady(actor);
  const row = await prisma.setting.findUnique({ where: { key: TEMPLATE_KEY } });
  return row?.value ?? DEFAULT_SMS_TEMPLATE;
}

export async function saveSmsTemplate(actor: SessionUser, raw: string): Promise<void> {
  assertHost(actor); assertReady(actor);
  const value = raw.replace(/\r\n/g, "\n").trim();
  if (!value) throw invalid("Le modèle ne peut pas être vide.");
  if (value.length > SMS_TEMPLATE_MAX) throw invalid(`Le modèle fait au plus ${SMS_TEMPLATE_MAX} caractères.`);
  if (!value.includes("{motdepasse}")) throw invalid("Le modèle doit contenir {motdepasse}, sinon le membre ne pourra pas se connecter.");
  await prisma.setting.upsert({ where: { key: TEMPLATE_KEY }, create: { key: TEMPLATE_KEY, value }, update: { value } });
}

export async function resetSmsTemplate(actor: SessionUser): Promise<void> {
  assertHost(actor); assertReady(actor);
  await prisma.setting.deleteMany({ where: { key: TEMPLATE_KEY } });
}

// ---------- Fournisseurs ----------

type Provider = { id: "twilio" | "brevo"; label: string; send: (to: string, text: string) => Promise<{ reference: string; status: string }> };

function twilio(): Provider | null {
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM, service = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid || !token || !(from || service)) return null;
  return {
    id: "twilio", label: "Twilio",
    async send(to, text) {
      const body = new URLSearchParams({ To: to, Body: text, ...(service ? { MessagingServiceSid: service } : { From: from! }) });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
        body, signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string };
      if (!res.ok || !json.sid) throw new Error(`Twilio a refusé l'envoi (${res.status}${json.message ? ` : ${json.message}` : ""}).`);
      return { reference: json.sid, status: json.status ?? "queued" };
    },
  };
}

function brevo(): Provider | null {
  const key = process.env.BREVO_API_KEY, sender = process.env.BREVO_SMS_SENDER;
  if (!key || !sender) return null;
  return {
    id: "brevo", label: "Brevo",
    async send(to, text) {
      const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
        // Brevo attend le numéro sans « + » (indicatif compris).
        body: JSON.stringify({ sender, recipient: to.replace(/^\+/, ""), content: text, type: "transactional", unicodeEnabled: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { reference?: string; messageId?: number; message?: string };
      if (!res.ok) throw new Error(`Brevo a refusé l'envoi (${res.status}${json.message ? ` : ${json.message}` : ""}).`);
      return { reference: String(json.reference ?? json.messageId ?? ""), status: "accepted" };
    },
  };
}

/** Fournisseur configuré, ou null. SMS_PROVIDER force le choix s'il y en a deux. */
export function smsProvider(): Provider | null {
  const wanted = process.env.SMS_PROVIDER?.toLowerCase();
  const all = [twilio(), brevo()].filter((p): p is Provider => !!p);
  return all.find((p) => p.id === wanted) ?? (wanted ? null : all[0] ?? null);
}

export function smsProviderLabel(): string | null {
  return smsProvider()?.label ?? null;
}

/** Envoie le texte composé par l'Hôte au numéro enregistré du profil. Le
 * résultat signifie « accepté par le fournisseur », pas « reçu » : la
 * remise sur le téléphone n'est pas connue à cet instant. */
export async function sendMemberSms(actor: SessionUser, userId: string, rawText: string) {
  assertHost(actor); assertReady(actor);
  const provider = smsProvider();
  if (!provider) throw new AppError("INVALID", "Aucun service d'envoi de SMS n'est configuré sur le serveur.");
  const text = rawText.replace(/\r\n/g, "\n").trim();
  if (!text) throw invalid("Le message est vide.");
  if (text.length > SMS_MAX) throw invalid(`Le message fait au plus ${SMS_MAX} caractères.`);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true, displayName: true } });
  if (!target) throw notFound("Membre");
  if (!target.phone) throw invalid(`Aucun numéro de portable n'est enregistré pour ${target.displayName}.`);
  try {
    const r = await provider.send(target.phone, text);
    return { provider: provider.label, ...r };
  } catch (e) {
    console.error("Envoi SMS", e);
    throw new AppError("INVALID", e instanceof Error && /refusé/.test(e.message) ? e.message : `Le service ${provider.label} est injoignable. Réessaie, ou ouvre l'application SMS.`);
  }
}
