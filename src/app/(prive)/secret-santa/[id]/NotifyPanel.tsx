"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { ActionState } from "@/app/actions/run";
import { sendSantaMessageAction } from "@/app/actions/santa";
import { ActionForm, ConfirmSubmit } from "@/components/ActionForm";
import { formatPhone } from "@/lib/phone";
import { SANTA_MESSAGE_MAX } from "@/lib/santaMessages";
import type { SmsResult } from "@/lib/services/santaMessages";

type Recipient = { id: string; displayName: string; phone: string | null };
type Kind = "ANNONCE" | "TIRAGE";

const QUESTION: Record<Kind, string> = {
  ANNONCE: "Ton événement Secret Santa a bien été créé ! Souhaites-tu prévenir les participants ?",
  TIRAGE: "Le tirage Secret Santa a bien été effectué ! 🎉 Souhaites-tu prévenir les participants ?",
};

const smsHref = (phone: string, text: string) => `sms:${phone}?&body=${encodeURIComponent(text)}`;

/** Prévenir les participants d'un événement : question, aperçu modifiable,
 * confirmation, puis compte rendu honnête de ce qui a été fait. */
export function NotifyPanel({ eventId, kind, defaultText, recipients, provider, ask, label }: {
  eventId: string; kind: Kind; defaultText: string; recipients: Recipient[]; provider: string | null; ask: boolean; label?: string;
}) {
  const pathname = usePathname();
  const [step, setStep] = useState<"ask" | "closed" | "compose" | "done">(ask ? "ask" : "closed");
  const [text, setText] = useState(defaultText);
  const [result, setResult] = useState<{ published: number; sms: SmsResult[] } | null>(null);
  const [copied, setCopied] = useState(false);

  // Retire ?annonce=1 / ?tirage=1 pour que la question ne revienne pas au rechargement.
  // history.replaceState (et non router.replace) : pas de nouveau rendu serveur,
  // qui démonterait ce panneau et son compte rendu d'envoi.
  const clearQuery = () => { if (ask) window.history.replaceState(null, "", pathname); };
  const later = () => { setStep("closed"); clearQuery(); };

  if (step === "closed") {
    // Question écartée (« Plus tard ») : rien, le bouton permanent reste dans « Organisation ».
    if (ask) return null;
    return (
      <button type="button" className="btn ghost small" onClick={() => setStep("compose")}>
        <span aria-hidden="true">📣</span> {label ?? "Envoyer un message aux participants"}
      </button>
    );
  }

  if (step === "ask") {
    return (
      <div className="notify-ask" role="dialog" aria-modal="false" aria-labelledby={`q-${kind}`}>
        <p id={`q-${kind}`} className="notify-q">{QUESTION[kind]}</p>
        <div className="confirm-row">
          <button type="button" className="btn gold" onClick={() => setStep("compose")}>Envoyer un message aux participants</button>
          <button type="button" className="btn ghost" onClick={later}>Plus tard</button>
        </div>
      </div>
    );
  }

  if (step === "done" && result) {
    const withPhone = recipients.filter((r) => r.phone);
    const noPhone = recipients.filter((r) => !r.phone);
    return (
      <div className="notify-box">
        <p className="status ok" role="status">
          ✅ Message publié sur le site : {result.published} participant{result.published > 1 ? "s le verront" : " le verra"} en bannière à sa prochaine visite.
        </p>
        {result.sms.length ? (
          <ul className="list-plain">
            {result.sms.map((r) => (
              <li key={r.name}>
                <span>{r.name}</span>
                {r.status === "sent" ? <span className="pill done">SMS accepté par {provider}</span>
                  : r.status === "no_phone" ? <span className="pill past">Pas de numéro</span>
                  : <span className="pill wait" title={r.detail}>SMS non envoyé</span>}
              </li>
            ))}
          </ul>
        ) : null}
        {!result.sms.length && withPhone.length ? (
          <>
            <p className="hint">Pour l&apos;envoyer aussi par SMS depuis ton téléphone, ouvre chaque conversation (le message est prérempli ; c&apos;est toi qui appuies sur Envoyer) :</p>
            <ul className="list-plain">
              {withPhone.map((r) => (
                <li key={r.id}>
                  <span>{r.displayName} <span className="hint">· {formatPhone(r.phone)}</span></span>
                  <a className="btn small" href={smsHref(r.phone!, text)}>📱 Ouvrir l&apos;app SMS</a>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {noPhone.length && !result.sms.length ? <p className="hint">Sans numéro enregistré : {noPhone.map((r) => r.displayName).join(", ")} (ils verront le message sur le site).</p> : null}
        <div className="confirm-row">
          <button type="button" className="btn ghost small" onClick={async () => {
            try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
          }}>{copied ? "Copié !" : "Copier le message"}</button>
          <button type="button" className="btn ghost small" onClick={() => { setStep("closed"); setResult(null); }}>Fermer</button>
        </div>
      </div>
    );
  }

  return (
    <div className="notify-box">
      <ActionForm action={sendSantaMessageAction} className="grid"
        onSuccess={(s: ActionState) => { setResult(s.data as { published: number; sms: SmsResult[] }); setStep("done"); clearQuery(); }}>
        <input type="hidden" name="id" value={eventId} />
        <input type="hidden" name="kind" value={kind} />
        <label className="f-full">Aperçu du message (modifiable)
          <textarea name="text" rows={12} maxLength={SANTA_MESSAGE_MAX} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <p className="hint f-full">
          Destinataires : uniquement les participants de cet événement{recipients.length ? <> — {recipients.map((r) => r.displayName).join(", ")}</> : null}.
          {kind === "TIRAGE" ? " Le message ne contient aucun résultat du tirage." : null}
        </p>
        {provider ? (
          <label className="check f-full">
            <input type="checkbox" name="sms" value="1" defaultChecked /> Envoyer aussi par SMS via {provider} ({recipients.filter((r) => r.phone).length} numéro{recipients.filter((r) => r.phone).length > 1 ? "s" : ""})
          </label>
        ) : (
          <p className="hint f-full">Le message sera affiché sur le site aux participants. Tu pourras ensuite l&apos;ouvrir dans ton application SMS, participant par participant.</p>
        )}
        <div className="actions">
          <ConfirmSubmit label={`Envoyer aux ${recipients.length || ""} participants`.replace("  ", " ")} confirmLabel="Confirmer l'envoi" className="btn gold" />
          <button type="button" className="btn ghost" onClick={() => { setText(defaultText); later(); }}>Annuler</button>
        </div>
      </ActionForm>
    </div>
  );
}
