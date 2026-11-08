import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/services/errors";

export type ActionState = { ok?: boolean; error?: string; message?: string; data?: unknown; key?: number };

/** Exécute une action et traduit les erreurs métier en message affichable.
 * Les redirections de Next (qui passent par une exception) sont relancées. */
export async function run(fn: () => Promise<string | void | { message?: string; data?: unknown }>): Promise<ActionState> {
  try {
    const r = await fn();
    if (typeof r === "string") return { ok: true, message: r, key: Date.now() };
    return { ok: true, message: r?.message, data: r?.data, key: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, error: e.message, key: Date.now() };
    console.error(e);
    return { ok: false, error: "Une erreur inattendue est survenue. Réessaie dans un moment.", key: Date.now() };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};
