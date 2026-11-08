"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/next";
import { updateMyProfile } from "@/lib/services/account";
import { addItem, claimItem, deleteItem, unclaimItem, updateItem } from "@/lib/services/wishlist";
import { run, str, type ActionState } from "./run";

const done = <T extends ActionState>(s: T) => { if (s.ok) revalidatePath("/", "layout"); return s; };

export async function saveItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = str(fd, "id");
  const input = { title: str(fd, "title"), price: str(fd, "price"), link: str(fd, "link"), note: str(fd, "note"), wish: str(fd, "wish") };
  return done(await run(async () => {
    if (id) { await updateItem(user, id, input); return "Modification enregistrée."; }
    await addItem(user, input);
    return "Ajouté à ta liste.";
  }));
}

export async function deleteItemAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(() => deleteItem(user, str(fd, "id"))));
}

export async function claimAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(() => claimItem(user, str(fd, "itemId"))));
}

export async function unclaimAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  return done(await run(() => unclaimItem(user, str(fd, "itemId"))));
}

export async function updateProfileAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  let avatar: unknown = null;
  try { avatar = JSON.parse(str(fd, "avatar") || "null"); } catch { avatar = null; }
  return done(await run(async () => {
    await updateMyProfile(user, { displayName: str(fd, "displayName"), about: str(fd, "about"), avatar });
    return "Profil enregistré.";
  }));
}
