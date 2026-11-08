import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/next";
import { changePasswordAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

export const metadata = { title: "Choisis ton mot de passe" };

// Première connexion (ou mot de passe réinitialisé par l'Hôte) : le membre
// remplace le mot de passe provisoire avant d'accéder au reste du site.
export default async function ForcedPasswordPage() {
  const user = await requireUser({ allowMustChange: true });
  if (!user.mustChangePassword) redirect("/compte");
  return (
    <div className="box auth-card">
      <h2>Bienvenue {user.displayName} !</h2>
      <p className="hint">Choisis ton propre mot de passe. Celui que l&apos;Hôte t&apos;a envoyé ne fonctionnera plus ensuite.</p>
      <ActionForm action={changePasswordAction} className="grid">
        <label className="f-full">Mot de passe reçu par SMS
          <input name="current" type="password" required autoComplete="current-password" />
        </label>
        <label className="f-full">Nouveau mot de passe
          <input name="next" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
          <span className="hint">Au moins {PASSWORD_MIN_LENGTH} caractères.</span>
        </label>
        <label className="f-full">Confirme le nouveau mot de passe
          <input name="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
        </label>
        <div className="actions"><SubmitButton pendingLabel="Enregistrement…">Valider</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
