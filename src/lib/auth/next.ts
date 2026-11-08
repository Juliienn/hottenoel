// Pont entre les sessions (./core.ts) et Next : cookie, redirections.
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, validateSessionToken, type SessionUser } from "./core";

export const getSessionToken = async () => (await cookies()).get(SESSION_COOKIE)?.value;

// Une seule lecture en base par requête, même si layout + page + action la demandent.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => validateSessionToken(await getSessionToken()));

/** À appeler en tête de chaque page privée ET de chaque action serveur. */
export async function requireUser(opts: { allowMustChange?: boolean } = {}): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");
  if (user.mustChangePassword && !opts.allowMustChange) redirect("/compte/mot-de-passe");
  return user;
}

/** Pages d'administration : un membre reçoit une page 404, rien ne lui
 * indique que la page existe. Les services revérifient le rôle de toute façon. */
export async function requireHostPage(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "HOST") notFound();
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  // Sur Vercel, x-forwarded-for est réécrit par la plateforme : le premier
  // élément est l'adresse réelle du visiteur.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
}

/** Chemin interne sûr pour la redirection après connexion (pas d'URL externe). */
export function safeNext(raw: unknown): string {
  const s = typeof raw === "string" ? raw : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/ma-liste";
}
