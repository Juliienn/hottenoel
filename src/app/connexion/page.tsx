import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/next";
import { hostExists, listLoginProfiles } from "@/lib/services/account";
import { ProfilePicker } from "./ProfilePicker";

export const metadata = { title: "Qui est-ce ?" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suivant?: string; installe?: string }> }) {
  if (await getSessionUser()) redirect("/ma-liste");
  const sp = await searchParams;
  const [installed, profiles] = await Promise.all([hostExists(), listLoginProfiles()]);
  return (
    <div className="who">
      <h2 className="who-title">Qui ouvre sa hotte ?</h2>
      {sp.installe ? <p className="notice who-notice">Compte Hôte créé. Choisis ton profil pour ajouter les membres de la famille.</p> : null}
      {!installed ? <p className="notice warn who-notice">Le site n&apos;est pas encore installé : la personne qui l&apos;héberge doit d&apos;abord créer le compte Hôte sur la page /installation.</p> : null}
      {profiles.length ? <ProfilePicker profiles={profiles} next={sp.suivant ?? ""} /> : null}
      <p className="hint who-foot">Ton profil n&apos;apparaît pas ? Seul l&apos;Hôte peut créer ou réactiver les profils de la famille : demande-lui.</p>
    </div>
  );
}
