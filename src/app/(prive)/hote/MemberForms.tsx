"use client";

import { useState } from "react";
import type { ActionState } from "@/app/actions/run";
import {
  createMemberAction, deleteMemberAction, resetPasswordAction, saveSmsTemplateAction, setActiveAction, updateMemberAction, type Creds,
} from "@/app/actions/admin";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { AvatarBuilder } from "@/components/AvatarBuilder";
import { formatPhone } from "@/lib/phone";
import { DEFAULT_SMS_TEMPLATE, SMS_TEMPLATE_MAX } from "@/lib/smsTemplate";
import { PhoneIcon, SmsComposer } from "./SmsComposer";

type SmsContext = { siteUrl: string; template: string; provider: string | null };

export type MemberView = {
  id: string; displayName: string; phone: string | null; avatar: unknown; active: boolean; isHost: boolean; isMe: boolean;
  hasPassword: boolean; mustChangePassword: boolean; itemCount: number;
};

const PW_HINT = "Laisse vide pour en générer un automatiquement (3 mots + un nombre).";

export function CreateMemberForm({ sms }: { sms: SmsContext }) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [formKey, setFormKey] = useState(0);
  return (
    <>
      <ActionForm key={formKey} action={createMemberAction} className="grid"
        onSuccess={(s: ActionState) => { setCreds(s.data as Creds); setFormKey((k) => k + 1); }}>
        <label className="f-half">Prénom
          <input name="displayName" required maxLength={40} placeholder="Tom" />
          <span className="hint">C&apos;est le nom affiché sur sa vignette de connexion.</span>
        </label>
        <label className="f-half">Portable
          <input name="phone" type="tel" inputMode="tel" autoComplete="off" maxLength={25} placeholder="06 12 34 56 78" />
          <span className="hint">Facultatif, pour lui envoyer ses accès par SMS.</span>
        </label>
        <label className="f-full">Mot de passe initial
          <input name="password" autoComplete="off" maxLength={200} placeholder="Généré automatiquement" />
          <span className="hint">{PW_HINT} Le membre le remplacera à sa première connexion.</span>
        </label>
        <div className="f-full" style={{ display: "grid", gap: 8 }}>
          <span className="lbl">Avatar</span>
          <AvatarBuilder initial={null} />
        </div>
        <div className="actions"><SubmitButton pendingLabel="Création…">Créer le profil</SubmitButton></div>
      </ActionForm>
      {/* Le formulaire est remis à neuf (avatar compris) : le message de succès vit ici. */}
      {creds ? <p className="status ok" role="status">Profil de {creds.displayName} créé.</p> : null}
      {creds ? (
        <SmsComposer key={creds.id + creds.password} member={{ ...creds, isMe: false }} initialPassword={creds.password} {...sms} onClose={() => setCreds(null)} />
      ) : null}
    </>
  );
}

/** Une ligne de la liste des membres : bouton SMS en façade, gestion repliée. */
export function MemberRow({ m, sms }: { m: MemberView; sms: SmsContext }) {
  const [smsOpen, setSmsOpen] = useState(false);
  // Mot de passe provisoire tout juste généré : gardé en mémoire de l'onglet
  // le temps de préparer le SMS, jamais renvoyé par le serveur ensuite.
  const [password, setPassword] = useState<string | null>(null);
  const onReset = (s: ActionState) => { setPassword((s.data as Creds).password); setSmsOpen(true); };
  const canSms = !m.isMe;
  return (
    <div className={`member${m.active ? "" : " inactive"}`}>
      <Avatar avatar={m.avatar} size={44} />
      <div style={{ minWidth: 0 }}>
        <div className="name">{m.displayName}</div>
        <div className="meta">
          {m.phone ? formatPhone(m.phone) : <>Pas de numéro</>} · {m.itemCount} idée{m.itemCount > 1 ? "s" : ""}
        </div>
      </div>
      <div className="member-tags">
        {m.isHost ? <span className="badge">Hôte</span> : null}
        {!m.active ? <span className="pill past">Désactivé</span> : null}
        {m.active && !m.hasPassword ? <span className="pill wait">À activer</span> : null}
        {m.active && m.hasPassword && m.mustChangePassword && !m.isHost ? <span className="pill wait">1re connexion à faire</span> : null}
        {canSms ? (
          <button type="button" className={`icon-btn${smsOpen ? " on" : ""}`} aria-expanded={smsOpen}
            aria-label={`Envoyer ses accès par SMS à ${m.displayName}`} title={m.phone ? `SMS à ${formatPhone(m.phone)}` : "SMS (aucun numéro enregistré)"}
            onClick={() => setSmsOpen((o) => !o)}>
            <PhoneIcon /><span>SMS</span>
          </button>
        ) : null}
      </div>
      {smsOpen ? (
        <div className="member-sms">
          <SmsComposer key={password ?? "x"} member={{ id: m.id, displayName: m.displayName, phone: m.phone, isMe: m.isMe, hasOwnPassword: m.hasPassword && !m.mustChangePassword }}
            initialPassword={password} {...sms} onClose={() => { setSmsOpen(false); setPassword(null); }} />
        </div>
      ) : null}
      <details>
        <summary>Gérer {m.isMe ? "mon profil" : "ce profil"}</summary>
        <ManageMember m={m} onReset={onReset} />
      </details>
    </div>
  );
}

function ManageMember({ m, onReset }: { m: MemberView; onReset: (s: ActionState) => void }) {
  return (
    <div className="admin-forms">
      <ActionForm action={updateMemberAction} className="grid">
        <input type="hidden" name="id" value={m.id} />
        <label className="f-half">Prénom
          <input name="displayName" required maxLength={40} defaultValue={m.displayName} />
        </label>
        <label className="f-half">Portable
          <input name="phone" type="tel" inputMode="tel" maxLength={25} defaultValue={m.phone ? formatPhone(m.phone) : ""} placeholder="06 12 34 56 78" />
        </label>
        <details className="f-full avatar-edit">
          <summary>Changer l&apos;avatar</summary>
          <AvatarBuilder initial={m.avatar} />
        </details>
        <div className="actions"><SubmitButton className="btn small">Enregistrer</SubmitButton></div>
      </ActionForm>

      {!m.isMe ? (
        <ActionForm action={resetPasswordAction} className="grid" resetOnSuccess onSuccess={onReset}>
          <input type="hidden" name="id" value={m.id} />
          <label className="f-full">{m.hasPassword ? "Nouveau mot de passe provisoire" : "Mot de passe provisoire (active le profil)"}
            <input name="password" autoComplete="off" maxLength={200} placeholder="Généré automatiquement" />
            <span className="hint">{PW_HINT} L&apos;ancien mot de passe cessera de fonctionner.</span>
          </label>
          <div className="actions">
            <SubmitButton className="btn small">{m.hasPassword ? "Réinitialiser le mot de passe" : "Activer le profil"}</SubmitButton>
          </div>
        </ActionForm>
      ) : <p className="hint">Ton propre mot de passe se change dans « Mon compte ».</p>}

      {!m.isHost ? (
        <div className="confirm-row">
          <ActionForm action={setActiveAction}>
            <input type="hidden" name="id" value={m.id} />
            <input type="hidden" name="active" value={m.active ? "0" : "1"} />
            {m.active
              ? <ConfirmSubmit label="Désactiver" confirmLabel="Confirmer la désactivation" className="btn ghost small" />
              : <SubmitButton className="btn small">Réactiver</SubmitButton>}
          </ActionForm>
          <ActionForm action={deleteMemberAction}>
            <input type="hidden" name="id" value={m.id} />
            <ConfirmSubmit label="Supprimer" confirmLabel="Supprimer définitivement (liste comprise)" />
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}

export function SmsTemplateForm({ template }: { template: string }) {
  const [value, setValue] = useState(template);
  return (
    <ActionForm action={saveSmsTemplateAction} className="grid">
      <label className="f-full">Modèle du message
        <textarea name="template" rows={6} maxLength={SMS_TEMPLATE_MAX} value={value} onChange={(e) => setValue(e.target.value)} />
        <span className="hint">Variables remplacées automatiquement : <code>{"{prenom}"}</code>, <code>{"{motdepasse}"}</code>, <code>{"{lien}"}</code>. En « simple rappel », les lignes contenant <code>{"{motdepasse}"}</code> sont retirées.</span>
      </label>
      <div className="actions">
        <SubmitButton className="btn small">Enregistrer le modèle</SubmitButton>
        <button type="submit" name="reset" value="1" className="btn ghost small" onClick={() => setValue(DEFAULT_SMS_TEMPLATE)}>Revenir au modèle par défaut</button>
      </div>
    </ActionForm>
  );
}
