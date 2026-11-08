import { requireUser } from "@/lib/auth/next";
import { getMyAccount } from "@/lib/services/account";
import { changePasswordAction } from "@/app/actions/auth";
import { updateProfileAction } from "@/app/actions/wishlist";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

export const metadata = { title: "Mon compte" };

export default async function AccountPage() {
  const user = await requireUser();
  const me = await getMyAccount(user);
  return (
    <div className="panel">
      <div className="box">
        <h2>Mon profil</h2>
        <p className="hint">Ton identifiant de connexion : <b>{me.login}</b>. Seul l&apos;Hôte peut le changer.</p>
        <ActionForm action={updateProfileAction} className="grid">
          <label className="f-full">Prénom ou surnom
            <input name="displayName" maxLength={40} required defaultValue={me.displayName} />
          </label>
          <label className="f-full">Tailles, goûts, ce que tu as déjà
            <textarea name="about" maxLength={600} defaultValue={me.about} placeholder="Pointure 42, taille M, pas de chocolat noir…" />
          </label>
          <div className="f-full" style={{ display: "grid", gap: 8 }}>
            <span className="lbl">Mon avatar</span>
            <AvatarBuilder initial={me.avatar} />
          </div>
          <div className="actions"><SubmitButton className="btn" pendingLabel="Enregistrement…">Enregistrer le profil</SubmitButton></div>
        </ActionForm>
      </div>

      <div className="box">
        <h2>Changer mon mot de passe</h2>
        <ActionForm action={changePasswordAction} className="grid" resetOnSuccess>
          <label className="f-full">Mot de passe actuel
            <input name="current" type="password" required autoComplete="current-password" />
          </label>
          <label className="f-half">Nouveau mot de passe
            <input name="next" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
          </label>
          <label className="f-half">Confirme le nouveau mot de passe
            <input name="confirm" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
          </label>
          <div className="actions"><SubmitButton className="btn ghost">Changer le mot de passe</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
