"use server";

import { redirect } from "next/navigation";
import { deleteSession, login } from "@/lib/auth/core";
import { clearSessionCookie, clientIp, getSessionToken, requireUser, safeNext, setSessionCookie } from "@/lib/auth/next";
import { changeMyPassword, setupHost } from "@/lib/services/account";
import { parseJson, run, str, type ActionState } from "./run";
import { revalidatePath } from "next/cache";

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  // Le profil est désigné par son id technique (champ caché de la vignette).
  const result = await login(str(fd, "profileId"), str(fd, "password"), await clientIp());
  if (!result.ok) return { ok: false, error: result.error, key: Date.now() };
  await setSessionCookie(result.token, result.expiresAt);
  redirect(result.user.mustChangePassword ? "/compte/mot-de-passe" : safeNext(str(fd, "suivant")));
}

export async function logoutAction(): Promise<void> {
  await deleteSession(await getSessionToken());
  await clearSessionCookie();
  redirect("/connexion");
}

export async function setupAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const state = await run(async () => {
    await setupHost(str(fd, "token"), { displayName: str(fd, "displayName"), password: str(fd, "password"), avatar: parseJson(str(fd, "avatar")) });
  });
  if (state.ok) redirect("/connexion?installe=1");
  return state;
}

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser({ allowMustChange: true });
  if (str(fd, "next") !== str(fd, "confirm")) return { ok: false, error: "Les deux nouveaux mots de passe ne sont pas identiques.", key: Date.now() };
  const wasForced = user.mustChangePassword;
  const state = await run(async () => {
    await changeMyPassword(user, str(fd, "current"), str(fd, "next"), await getSessionToken());
    return "Mot de passe modifié. Tes autres appareils ont été déconnectés.";
  });
  if (state.ok && wasForced) redirect("/ma-liste");
  revalidatePath("/", "layout");
  return state;
}
