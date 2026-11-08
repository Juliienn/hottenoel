import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/next";
import { hostExists } from "@/lib/services/account";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/ActionForm";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suivant?: string; installe?: string }> }) {
  if (await getSessionUser()) redirect("/ma-liste");
  const sp = await searchParams;
  const installed = await hostExists();
  return (
    <div className="box auth-card">
      <h2>Connexion</h2>
      <p className="hint">Utilise l&apos;identifiant et le mot de passe que l&apos;Hôte de la famille t&apos;a envoyés.</p>
      {sp.installe ? <p className="notice" style={{ marginTop: 12 }}>Compte Hôte créé. Connecte-toi pour ajouter les membres de la famille.</p> : null}
      {!installed ? <p className="notice warn" style={{ marginTop: 12 }}>Le site n&apos;est pas encore installé : la personne qui l&apos;héberge doit d&apos;abord créer le compte Hôte sur la page /installation.</p> : null}
      <ActionForm action={loginAction} className="grid">
        <input type="hidden" name="suivant" value={sp.suivant ?? ""} />
        <label className="f-full">Identifiant
          <input name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={60} />
        </label>
        <label className="f-full">Mot de passe
          <input name="password" type="password" autoComplete="current-password" required maxLength={200} />
        </label>
        <div className="actions"><SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton></div>
      </ActionForm>
      <p className="hint" style={{ marginTop: 14 }}>Pas de compte ? Seul l&apos;Hôte peut créer les profils de la famille : demande-lui.</p>
    </div>
  );
}
