// Erreur métier dont le message peut être montré tel quel au membre.
// Toute autre exception est une panne : on affiche un message générique.
export type AppErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "CONFLICT" | "RATE_LIMITED";

export class AppError extends Error {
  constructor(public code: AppErrorCode, message: string) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = () => new AppError("FORBIDDEN", "Tu n'as pas le droit de faire ça.");
export const notFound = (what = "Élément") => new AppError("NOT_FOUND", `${what} introuvable.`);
export const invalid = (msg: string) => new AppError("INVALID", msg);
