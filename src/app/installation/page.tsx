import Link from "next/link";
import { hostExists, LOGIN_RULES } from "@/lib/services/account";
import { setupAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { PASSWORD_MIN_LENGTH } from "@/lib/password";

export const metadata = { title: "Installation" };

export default async function SetupPage() {
  if (await hostExists()) {
    return (
      <div className="box auth-card">
        <h2>Installation terminée</h2>
        <p className="hint">Le compte Hôte existe déjà. Cette page est définitivement fermée.</p>
        <p><Link href="/connexion" className="btn small">Aller à la connexion</Link></p>
      </div>
    );
  }
  return (
    <div className="box auth-card">
      <h2>Créer le compte Hôte</h2>
      <p className="hint">Une seule fois. Le jeton d&apos;installation est la valeur de la variable <code>SETUP_TOKEN</code> configurée sur l&apos;hébergement : sans lui, impossible de devenir Hôte.</p>
      <ActionForm action={setupAction} className="grid">
        <label className="f-full">Jeton d&apos;installation
          <input name="token" type="password" required autoComplete="off" />
        </label>
        <label className="f-full">Ton prénom
          <input name="displayName" required maxLength={40} />
        </label>
        <label className="f-full">Identifiant de connexion
          <input name="login" required autoCapitalize="none" spellCheck={false} maxLength={30} />
          <span className="hint">{LOGIN_RULES}</span>
        </label>
        <label className="f-full">Mot de passe
          <input name="password" type="password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" />
          <span className="hint">Au moins {PASSWORD_MIN_LENGTH} caractères.</span>
        </label>
        <div className="actions"><SubmitButton pendingLabel="Création…">Créer le compte Hôte</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
