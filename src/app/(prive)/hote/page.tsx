import { headers } from "next/headers";
import { requireHostPage } from "@/lib/auth/next";
import { listMembers } from "@/lib/services/members";
import { LOGIN_RULES } from "@/lib/services/account";
import { Avatar } from "@/components/Avatar";
import { CreateMemberForm, ManageMember } from "./MemberForms";

export const metadata = { title: "Espace Hôte" };

export default async function HostPage() {
  const user = await requireHostPage();
  const members = await listMembers(user);
  const h = await headers();
  const siteUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <div className="panel">
      <div className="box">
        <h2>Créer un profil</h2>
        <p className="hint">Personne ne peut créer de compte soi-même : c&apos;est toi qui crées chaque profil, puis tu envoies ses identifiants par SMS. À sa première connexion, le membre choisit son propre mot de passe.</p>
        <CreateMemberForm siteUrl={siteUrl} loginRules={LOGIN_RULES} />
      </div>

      <div>
        <h2 className="section-title">Membres de la famille <span className="hint">· {members.length}</span></h2>
        <div className="members">
          {members.map((m) => (
            <div key={m.id} className={`member${m.active ? "" : " inactive"}`}>
              <Avatar avatar={m.avatar} size={40} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{m.displayName}</div>
                <div className="meta">
                  {m.login ? <>Identifiant : {m.login}</> : <>Pas encore d&apos;identifiant</>} · {m.itemCount} idée{m.itemCount > 1 ? "s" : ""}
                </div>
              </div>
              <div className="member-tags">
                {m.role === "HOST" ? <span className="badge">Hôte</span> : null}
                {!m.active ? <span className="pill past">Désactivé</span> : null}
                {m.active && !m.hasPassword ? <span className="pill wait">À activer</span> : null}
                {m.active && m.hasPassword && m.mustChangePassword && m.role !== "HOST" ? <span className="pill wait">1re connexion à faire</span> : null}
              </div>
              <details>
                <summary>Gérer {m.id === user.id ? "mon profil" : "ce profil"}</summary>
                <ManageMember m={{ id: m.id, displayName: m.displayName, login: m.login, active: m.active, isHost: m.role === "HOST", hasPassword: m.hasPassword }} siteUrl={siteUrl} />
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
