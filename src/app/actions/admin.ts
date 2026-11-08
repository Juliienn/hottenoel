"use server";

// Actions de l'Hôte. requireUser authentifie ; le rôle Hôte est vérifié par
// chaque service (assertHost), pas ici : une seule source de vérité.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/next";
import { createMember, deleteMember, resetMemberPassword, setMemberActive, updateMember } from "@/lib/services/members";
import {
  addExclusion, createEvent, deleteEvent, removeExclusion, revealAssignments, runDraw, setParticipants, updateEvent,
} from "@/lib/services/santa";
import { resetSmsTemplate, saveSmsTemplate, sendMemberSms } from "@/lib/services/sms";
import { parseJson, run, str, type ActionState } from "./run";

const done = <T extends ActionState>(s: T) => { if (s.ok) revalidatePath("/", "layout"); return s; };

// ---------- Membres ----------

export type Creds = { id: string; displayName: string; phone: string | null; password: string };

export async function createMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    const m = await createMember(user, {
      displayName: str(fd, "displayName"), password: str(fd, "password"), phone: str(fd, "phone"), avatar: parseJson(str(fd, "avatar")),
    });
    // Mot de passe renvoyé une seule fois, à l'Hôte, pour préparer le SMS.
    const data: Creds = { id: m.id, displayName: m.displayName, phone: m.phone, password: m.password };
    return { message: `Profil de ${m.displayName} créé.`, data };
  }));
}

export async function updateMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const avatar = str(fd, "avatar");
  return done(await run(async () => {
    await updateMember(user, str(fd, "id"), { displayName: str(fd, "displayName"), phone: str(fd, "phone"), avatar: avatar ? parseJson(avatar) : undefined });
    return "Profil mis à jour.";
  }));
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    const r = await resetMemberPassword(user, str(fd, "id"), str(fd, "password"));
    const data: Creds = r;
    return { message: `Nouveau mot de passe provisoire pour ${r.displayName}. L'ancien ne fonctionne plus ; il devra en choisir un à sa prochaine connexion.`, data };
  }));
}

export async function setActiveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const active = str(fd, "active") === "1";
  return done(await run(async () => {
    await setMemberActive(user, str(fd, "id"), active);
    return active ? "Compte réactivé." : "Compte désactivé : le membre est déconnecté et ne peut plus se connecter.";
  }));
}

export async function deleteMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => { await deleteMember(user, str(fd, "id")); return "Profil supprimé."; }));
}

// ---------- SMS ----------

export async function sendSmsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => {
    const r = await sendMemberSms(user, str(fd, "id"), str(fd, "text"));
    return { message: `SMS accepté par ${r.provider} pour envoi${r.reference ? ` (réf. ${r.reference})` : ""}.`, data: r };
  });
}

export async function saveSmsTemplateAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    if (str(fd, "reset") === "1") { await resetSmsTemplate(user); return "Modèle par défaut rétabli."; }
    await saveSmsTemplate(user, str(fd, "template"));
    return "Modèle de SMS enregistré.";
  }));
}

// ---------- Secret Santa ----------

const eventInput = (fd: FormData) => ({
  name: str(fd, "name"), giftDate: str(fd, "giftDate"), drawDate: str(fd, "drawDate"), budget: str(fd, "budget"), budgetKind: str(fd, "budgetKind"),
});

export async function createEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const state = await run(async () => {
    const ev = await createEvent(user, eventInput(fd), fd.getAll("participants").map(String));
    return { data: ev.id };
  });
  if (state.ok) { revalidatePath("/", "layout"); redirect(`/secret-santa/${state.data}`); }
  return state;
}

export async function updateEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => { await updateEvent(user, str(fd, "id"), eventInput(fd)); return "Événement mis à jour."; }));
}

export async function deleteEventAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const state = await run(() => deleteEvent(user, str(fd, "id")));
  if (state.ok) { revalidatePath("/", "layout"); redirect("/secret-santa"); }
  return state;
}

export async function setParticipantsAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    await setParticipants(user, str(fd, "id"), fd.getAll("participants").map(String));
    return "Participants enregistrés.";
  }));
}

export async function addExclusionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    await addExclusion(user, str(fd, "id"), str(fd, "giver"), str(fd, "receiver"), str(fd, "both") === "1");
    return "Exclusion ajoutée.";
  }));
}

export async function removeExclusionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(() => removeExclusion(user, str(fd, "id"), str(fd, "exclusionId"))));
}

export async function drawAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => { await runDraw(user, str(fd, "id")); return "Tirage effectué ! Chaque participant découvre maintenant son destinataire."; }));
}

export async function revealAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return run(async () => ({ data: await revealAssignments(user, str(fd, "id")) }));
}
