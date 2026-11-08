"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/next";
import { revealMyReceiver } from "@/lib/services/santa";
import { sendSantaMessage } from "@/lib/services/santaMessages";
import { run, str, type ActionState } from "./run";

/** Destinataire de l'utilisateur connecté (et de lui seul) pour l'animation
 * de révélation. Seul l'id de l'événement vient du navigateur. */
export async function revealMyReceiverAction(eventId: string): Promise<ActionState> {
  const user = await requireUser();
  // Pas de revalidatePath ici : rafraîchir la page pendant l'animation la
  // démonterait. La page est relue à la fermeture (router.refresh).
  return run(async () => ({ data: await revealMyReceiver(user, typeof eventId === "string" ? eventId : "") }));
}

export async function sendSantaMessageAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const kind = str(fd, "kind") === "TIRAGE" ? "TIRAGE" : "ANNONCE";
  const state = await run(async () => {
    const r = await sendSantaMessage(user, str(fd, "id"), kind, str(fd, "text"), str(fd, "sms") === "1");
    return { data: r };
  });
  if (state.ok) revalidatePath("/", "layout");
  return state;
}
