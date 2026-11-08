import { headers } from "next/headers";
import { requireHostPage } from "@/lib/auth/next";
import { listMembers } from "@/lib/services/members";
import { getSmsTemplate, smsProviderLabel } from "@/lib/services/sms";
import { CreateMemberForm, MemberRow, SmsTemplateForm } from "./MemberForms";

export const metadata = { title: "Espace Hôte" };

export default async function HostPage() {
  const user = await requireHostPage();
  const [members, template] = await Promise.all([listMembers(user), getSmsTemplate(user)]);
  const provider = smsProviderLabel();
  const h = await headers();
  const siteUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const sms = { siteUrl, template, provider };
  return (
    <div className="panel">
      <div className="box">
        <h2>Créer un profil</h2>
        <p className="hint">Personne ne peut créer de compte soi-même : c&apos;est toi qui crées chaque profil, puis tu envoies ses accès par SMS. Le membre se connecte en touchant sa vignette puis en tapant son mot de passe, qu&apos;il remplace à sa première connexion.</p>
        <CreateMemberForm sms={sms} />
      </div>

      <div>
        <h2 className="section-title">Membres de la famille <span className="hint">· {members.length}</span></h2>
        <div className="members">
          {members.map((m) => (
            <MemberRow key={m.id} sms={sms} m={{
              id: m.id, displayName: m.displayName, phone: m.phone, avatar: m.avatar, active: m.active, isHost: m.role === "HOST",
              isMe: m.id === user.id, hasPassword: m.hasPassword, mustChangePassword: m.mustChangePassword, itemCount: m.itemCount,
            }} />
          ))}
        </div>
      </div>

      <details className="box">
        <summary><h2 style={{ display: "inline" }}>Message SMS</h2></summary>
        <p className="hint" style={{ marginTop: 8 }}>
          {provider
            ? <>Envoi automatique activé via <b>{provider}</b> : le bouton « Envoyer via {provider} » expédie le SMS depuis le serveur, quel que soit ton appareil.</>
            : <>Aucun service d&apos;envoi automatique n&apos;est configuré : le bouton SMS ouvre l&apos;application Messages de ton téléphone avec le texte prérempli (tu appuies sur Envoyer), ou te permet de copier le message.</>}
        </p>
        <SmsTemplateForm template={template} />
      </details>
    </div>
  );
}
