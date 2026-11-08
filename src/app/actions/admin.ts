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
import { run, str, type ActionState } from "./run";

const done = <T extends ActionState>(s: T) => { if (s.ok) revalidatePath("/", "layout"); return s; };

// ---------- Membres ----------

export async function createMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const password = str(fd, "password");
  return done(await run(async () => {
    const m = await createMember(user, { displayName: str(fd, "displayName"), login: str(fd, "login"), password });
    // Renvoyé une seule fois, à l'Hôte qui vient de le saisir, pour préparer le SMS.
    return { message: `Profil de ${m.displayName} créé.`, data: { displayName: m.displayName, login: m.login, password } };
  }));
}

export async function updateMemberAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(async () => {
    await updateMember(user, str(fd, "id"), { displayName: str(fd, "displayName"), login: str(fd, "login") });
    return "Profil mis à jour.";
  }));
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const password = str(fd, "password");
  return done(await run(async () => {
    await resetMemberPassword(user, str(fd, "id"), password);
    return { message: "Mot de passe réinitialisé. Le membre devra en choisir un nouveau à sa prochaine connexion.", data: { login: str(fd, "login"), password, displayName: str(fd, "displayName") } };
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
