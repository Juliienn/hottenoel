// Listes de cadeaux et réservations.
// Confidentialité : le propriétaire d'une liste n'obtient JAMAIS l'état de
// réservation de ses propres cadeaux, par aucune fonction de ce fichier.
import { prisma } from "../prisma";
import { normalizeAvatar } from "../avatar";
import type { SessionUser } from "../auth/core";
import { AppError, forbidden, invalid, notFound } from "./errors";
import { assertReady } from "./guards";

export type ItemInput = { title: string; price: string; link: string; note: string; wish: string };

function cleanItem(input: ItemInput) {
  const title = input.title.trim();
  if (!title) throw invalid("Donne un nom au cadeau.");
  if (title.length > 120) throw invalid("Le nom du cadeau fait au plus 120 caractères.");
  const rawPrice = input.price.trim().replace(",", ".");
  let priceCents: number | null = null;
  if (rawPrice) {
    const p = Number(rawPrice);
    if (!Number.isFinite(p) || p < 0 || p > 100_000) throw invalid("Le prix doit être un nombre entre 0 et 100 000 €.");
    priceCents = Math.round(p * 100);
  }
  const link = input.link.trim();
  if (link) {
    let ok = false;
    try { const u = new URL(link); ok = u.protocol === "https:" || u.protocol === "http:"; } catch { /* lien invalide */ }
    if (!ok || link.length > 600) throw invalid("Le lien doit commencer par https://");
  }
  const note = input.note.trim();
  if (note.length > 500) throw invalid("Les précisions font au plus 500 caractères.");
  const wish = Math.min(3, Math.max(1, Number(input.wish) || 2));
  return { title, priceCents, link, note, wish };
}

const itemSelect = { id: true, title: true, priceCents: true, link: true, note: true, wish: true, createdAt: true } as const;

/** Ma liste : volontairement sans aucune information de réservation. */
export async function myItems(actor: SessionUser) {
  assertReady(actor);
  return prisma.wishItem.findMany({
    where: { ownerId: actor.id, deletedAt: null },
    select: itemSelect,
    orderBy: [{ wish: "desc" }, { priceCents: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export async function addItem(actor: SessionUser, input: ItemInput) {
  assertReady(actor);
  const count = await prisma.wishItem.count({ where: { ownerId: actor.id, deletedAt: null } });
  if (count >= 200) throw invalid("Ta liste contient déjà 200 idées : supprime-en avant d'en ajouter.");
  await prisma.wishItem.create({ data: { ...cleanItem(input), ownerId: actor.id } });
}

async function ownItem(actor: SessionUser, id: string) {
  const item = await prisma.wishItem.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true, claim: { select: { id: true } } } });
  // Même réponse pour « n'existe pas » et « pas à toi » : on ne révèle rien.
  if (!item || item.ownerId !== actor.id || item.deletedAt) throw notFound("Cadeau");
  return item;
}

export async function updateItem(actor: SessionUser, id: string, input: ItemInput) {
  assertReady(actor);
  await ownItem(actor, id);
  await prisma.wishItem.update({ where: { id }, data: cleanItem(input) });
}

export async function deleteItem(actor: SessionUser, id: string) {
  assertReady(actor);
  const item = await ownItem(actor, id);
  // La réponse est identique dans les deux cas : le propriétaire ne peut pas
  // déduire de la suppression que le cadeau était réservé.
  if (item.claim) await prisma.wishItem.update({ where: { id }, data: { deletedAt: new Date() } });
  else await prisma.wishItem.delete({ where: { id } });
}

// ---------- La famille ----------

/** Membres dont on peut consulter la liste : actifs, avec un compte utilisable,
 * sauf soi-même. Aucune donnée de compte (identifiant, rôle) n'en sort. */
export async function familyMembers(actor: SessionUser) {
  assertReady(actor);
  const users = await prisma.user.findMany({
    where: { active: true, passwordHash: { not: null }, id: { not: actor.id } },
    select: { id: true, displayName: true, avatar: true, _count: { select: { items: { where: { deletedAt: null } } } } },
    orderBy: { displayName: "asc" },
  });
  return users.map((u) => ({ id: u.id, displayName: u.displayName, avatar: normalizeAvatar(u.avatar), itemCount: u._count.items }));
}

export type ClaimState = { kind: "free" } | { kind: "mine" } | { kind: "taken"; by: string };

export async function memberList(actor: SessionUser, targetId: string) {
  assertReady(actor);
  if (targetId === actor.id) throw new AppError("FORBIDDEN", "C'est ta propre liste : ses réservations te restent cachées.");
  const target = await prisma.user.findFirst({
    where: { id: targetId, active: true, passwordHash: { not: null } },
    select: { id: true, displayName: true, about: true, avatar: true },
  });
  if (!target) throw notFound("Membre");
  const items = await prisma.wishItem.findMany({
    where: { ownerId: targetId, deletedAt: null },
    select: { ...itemSelect, claim: { select: { claimerId: true, claimer: { select: { displayName: true } } } } },
    orderBy: [{ wish: "desc" }, { priceCents: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return {
    member: { ...target, avatar: normalizeAvatar(target.avatar) },
    items: items.map(({ claim, ...it }) => ({
      ...it,
      state: (!claim ? { kind: "free" } : claim.claimerId === actor.id ? { kind: "mine" } : { kind: "taken", by: claim.claimer.displayName }) as ClaimState,
    })),
  };
}

export async function claimItem(actor: SessionUser, itemId: string) {
  assertReady(actor);
  const item = await prisma.wishItem.findUnique({
    where: { id: itemId },
    select: { ownerId: true, deletedAt: true, owner: { select: { active: true } } },
  });
  if (!item || item.deletedAt || !item.owner.active) throw notFound("Cadeau");
  if (item.ownerId === actor.id) throw forbidden();
  try {
    await prisma.claim.create({ data: { itemId, claimerId: actor.id } });
  } catch (e) {
    // Index unique sur itemId : le second clic simultané échoue ici.
    if (e && typeof e === "object" && "code" in e && e.code === "P2002") throw new AppError("CONFLICT", "Quelqu'un vient de réserver ce cadeau.");
    throw e;
  }
}

export async function unclaimItem(actor: SessionUser, itemId: string) {
  assertReady(actor);
  // Seule SA réservation peut être annulée : le filtre claimerId l'impose.
  const { count } = await prisma.claim.deleteMany({ where: { itemId, claimerId: actor.id } });
  if (!count) throw notFound("Réservation");
  // Un cadeau retiré par son propriétaire disparaît avec la dernière réservation.
  await prisma.wishItem.deleteMany({ where: { id: itemId, deletedAt: { not: null } } });
}

export async function myGifts(actor: SessionUser) {
  assertReady(actor);
  const claims = await prisma.claim.findMany({
    where: { claimerId: actor.id },
    select: {
      itemId: true,
      item: { select: { title: true, priceCents: true, link: true, deletedAt: true, owner: { select: { id: true, displayName: true, avatar: true, active: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  const groups = new Map<string, { owner: { id: string; displayName: string; avatar: ReturnType<typeof normalizeAvatar> }; lines: Array<{ itemId: string; title: string; priceCents: number | null; link: string; removed: boolean }> }>();
  for (const c of claims) {
    const o = c.item.owner;
    if (!groups.has(o.id)) groups.set(o.id, { owner: { id: o.id, displayName: o.displayName, avatar: normalizeAvatar(o.avatar) }, lines: [] });
    groups.get(o.id)!.lines.push({ itemId: c.itemId, title: c.item.title, priceCents: c.item.priceCents, link: c.item.link, removed: !!c.item.deletedAt });
  }
  return [...groups.values()].sort((a, b) => a.owner.displayName.localeCompare(b.owner.displayName, "fr"));
}
