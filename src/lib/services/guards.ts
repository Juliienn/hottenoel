import type { SessionUser } from "../auth/core";
import { forbidden } from "./errors";

// Chaque service reçoit l'utilisateur authentifié (relu en base à chaque
// requête, cf. validateSessionToken) et vérifie lui-même ses droits : une
// action serveur appelée à la main, sans passer par l'interface, est refusée
// exactement pareil.
export function assertHost(actor: SessionUser): void {
  if (actor.role !== "HOST") throw forbidden();
}

export function assertReady(actor: SessionUser): void {
  if (actor.mustChangePassword) throw forbidden();
}
