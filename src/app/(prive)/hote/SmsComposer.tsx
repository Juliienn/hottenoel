"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionState } from "@/app/actions/run";
import { resetPasswordAction, sendSmsAction, type Creds } from "@/app/actions/admin";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ActionForm";
import { formatPhone } from "@/lib/phone";
import { renderSms, SMS_MAX } from "@/lib/smsTemplate";

export type SmsMember = { id: string; displayName: string; phone: string | null; isMe: boolean; hasOwnPassword?: boolean };

type Feedback =
  | { kind: "prepared" }
  | { kind: "opening" }
  | { kind: "opened" }
  | { kind: "not-opened" }
  | { kind: "copied" }
  | { kind: "sent"; message: string }
  | { kind: "failed"; message: string };

const FEEDBACK: Record<Exclude<Feedback["kind"], "sent" | "failed">, { cls: string; text: string }> = {
  prepared: { cls: "ok", text: "✓ Message préparé. Il n'a pas encore été envoyé." },
  opening: { cls: "", text: "Ouverture de l'application SMS…" },
  opened: { cls: "ok", text: "📱 Application SMS ouverte avec le message. Envoi non confirmé : vérifie que tu as bien appuyé sur « Envoyer » dans l'application." },
  "not-opened": { cls: "err", text: "Aucune application SMS ne semble s'être ouverte sur cet appareil. Copie le message, ou envoie-le depuis ton téléphone." },
  copied: { cls: "ok", text: "📋 Message copié. Colle-le dans ta messagerie : rien n'a été envoyé." },
};

/** Lien sms: compris par iOS (« &body= ») et Android (« ?body= »). */
const smsHref = (phone: string | null, text: string) => `sms:${phone ?? ""}?&body=${encodeURIComponent(text)}`;

/** Prépare le SMS d'accès d'un membre et l'envoie par le moyen disponible.
 * Le mot de passe n'est jamais relisible (stocké haché) : pour l'inclure, il
 * faut soit venir de le créer, soit en générer un nouveau ici. */
export function SmsComposer({ member, siteUrl, template, provider, initialPassword, onClose }: {
  member: SmsMember; siteUrl: string; template: string; provider: string | null; initialPassword?: string | null; onClose?: () => void;
}) {
  const [password, setPassword] = useState<string | null>(initialPassword ?? null);
  const [mode, setMode] = useState<"acces" | "rappel">(
    // Membre qui a déjà choisi son mot de passe : par défaut un simple rappel,
    // pour ne pas remplacer son mot de passe par mégarde.
    initialPassword || (!member.isMe && !member.hasOwnPassword) ? "acces" : "rappel",
  );
  const link = `${siteUrl}/connexion`;
  const generated = useMemo(
    () => renderSms(template, { prenom: member.displayName, lien: link, motdepasse: mode === "acces" ? password : null }),
    [template, member.displayName, link, mode, password],
  );
  const [text, setText] = useState(generated);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  useEffect(() => { setText(generated); }, [generated]);

  const ready = mode === "rappel" || !!password;
  useEffect(() => { if (ready) setFeedback({ kind: "prepared" }); }, [ready, mode, password]);

  // Détection de l'ouverture de l'application : la page perd le focus ou est
  // masquée peu après le clic. Ce n'est pas une preuve d'envoi.
  const watch = useRef<() => void>(undefined);
  const onOpenApp = () => {
    watch.current?.();
    setFeedback({ kind: "opening" });
    let left = false;
    const mark = () => { left = true; setFeedback({ kind: "opened" }); };
    const onVis = () => { if (document.hidden) mark(); };
    window.addEventListener("blur", mark, { once: true });
    document.addEventListener("visibilitychange", onVis);
    const t = setTimeout(() => { cleanup(); if (!left) setFeedback({ kind: "not-opened" }); }, 2000);
    const cleanup = () => { clearTimeout(t); window.removeEventListener("blur", mark); document.removeEventListener("visibilitychange", onVis); };
    watch.current = cleanup;
  };
  useEffect(() => () => watch.current?.(), []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setFeedback({ kind: "copied" }); } catch { setFeedback({ kind: "not-opened" }); }
  };

  return (
    <div className="sms" aria-label={`SMS pour ${member.displayName}`}>
      <div className="sms-head">
        <span className="lbl">SMS pour {member.displayName} · {member.phone ? formatPhone(member.phone) : <em>aucun numéro enregistré</em>}</span>
        {onClose ? <button type="button" className="linkbtn" onClick={onClose}>Fermer</button> : null}
      </div>

      {!member.isMe ? (
        <div className="sms-modes" role="radiogroup" aria-label="Contenu du SMS">
          <button type="button" className="chip" role="radio" aria-checked={mode === "acces"} aria-pressed={mode === "acces"} onClick={() => setMode("acces")}>Accès avec mot de passe</button>
          <button type="button" className="chip" role="radio" aria-checked={mode === "rappel"} aria-pressed={mode === "rappel"} onClick={() => setMode("rappel")}>Simple rappel, sans mot de passe</button>
        </div>
      ) : null}

      {mode === "acces" && !password ? (
        <div className="notice warn">
          <p style={{ margin: "0 0 8px" }}>
            Le mot de passe de {member.displayName} est stocké haché : personne, pas même toi, ne peut le relire.
            Pour l&apos;envoyer, génère un nouveau mot de passe provisoire. <b>L&apos;ancien cessera de fonctionner</b> et {member.displayName} sera déconnecté·e.
          </p>
          <ActionForm action={resetPasswordAction} onSuccess={(s: ActionState) => setPassword((s.data as Creds).password)} showStatus>
            <input type="hidden" name="id" value={member.id} />
            <ConfirmSubmit label="Générer un nouveau mot de passe provisoire" confirmLabel="Confirmer : remplacer son mot de passe" className="btn gold small" />
          </ActionForm>
        </div>
      ) : null}

      {ready ? (
        <>
          <label>Message (modifiable avant l&apos;envoi)
            <textarea value={text} onChange={(e) => { setText(e.target.value); setFeedback({ kind: "prepared" }); }} rows={7} maxLength={SMS_MAX} />
          </label>
          <div className="confirm-row">
            {member.phone ? (
              <a className="btn small" href={smsHref(member.phone, text)} onClick={onOpenApp}>
                <PhoneIcon /> Ouvrir l&apos;application SMS
              </a>
            ) : null}
            {provider && member.phone ? (
              <ActionForm action={sendSmsAction} showStatus={false}
                onSuccess={(s: ActionState) => setFeedback({ kind: "sent", message: s.message ?? "SMS accepté pour envoi." })}
                onError={(s: ActionState) => setFeedback({ kind: "failed", message: s.error ?? "Échec de l'envoi." })}>
                <input type="hidden" name="id" value={member.id} />
                <input type="hidden" name="text" value={text} />
                <SubmitButton className="btn gold small" pendingLabel="Envoi…">Envoyer via {provider}</SubmitButton>
              </ActionForm>
            ) : null}
            <button type="button" className="btn ghost small" onClick={copy}>Copier le message</button>
          </div>
          {feedback ? (
            <p className={`status ${feedback.kind === "sent" ? "ok" : feedback.kind === "failed" ? "err" : FEEDBACK[feedback.kind].cls}`} role={feedback.kind === "failed" ? "alert" : "status"}>
              {feedback.kind === "sent" ? `✅ ${feedback.message} La réception sur le téléphone n'est pas encore connue.`
                : feedback.kind === "failed" ? `❌ SMS non envoyé : ${feedback.message}`
                : FEEDBACK[feedback.kind].text}
            </p>
          ) : null}
          <p className="hint">
            {member.phone ? null : <>Ajoute son numéro dans « Gérer ce profil » pour l&apos;envoyer directement. </>}
            {provider ? null : <>Sur ordinateur, sans service SMS configuré, copie le message ou ouvre-le sur ton téléphone. </>}
            {mode === "acces" ? <>Ce mot de passe ne sera plus affiché après fermeture de ce panneau.</> : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M10.5 18.5h3" /><path d="M9 7h6M9 10.5h4" />
    </svg>
  );
}
