"use client";

import { useState } from "react";
import type { ActionState } from "@/app/actions/run";
import { createMemberAction, deleteMemberAction, resetPasswordAction, setActiveAction, updateMemberAction } from "@/app/actions/admin";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ActionForm";
import { SmsCard } from "./SmsCard";

type Creds = { displayName: string; login: string; password: string };

/** Propose un mot de passe provisoire lisible (sans caractères ambigus). */
function suggestPassword(): string {
  const words = ["sapin", "renne", "flocon", "etoile", "houx", "lutin", "biche", "neige", "boule", "cadeau", "bougie", "givre"];
  const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
  const n = 10 + (crypto.getRandomValues(new Uint32Array(1))[0] % 90);
  return `${pick()}-${pick()}-${n}`;
}

export function CreateMemberForm({ siteUrl, loginRules }: { siteUrl: string; loginRules: string }) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [pw, setPw] = useState("");
  return (
    <>
      <ActionForm action={createMemberAction} className="grid" resetOnSuccess
        onSuccess={(s: ActionState) => { setCreds(s.data as Creds); setPw(""); }}>
        <label className="f-third">Prénom ou nom
          <input name="displayName" required maxLength={40} placeholder="Mamie Jo" />
        </label>
        <label className="f-third">Identifiant de connexion
          <input name="login" required maxLength={30} autoCapitalize="none" spellCheck={false} placeholder="mamie.jo" />
        </label>
        <label className="f-third">Mot de passe initial
          <input name="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
        </label>
        <p className="hint f-full">Identifiant : {loginRules}</p>
        <div className="actions">
          <SubmitButton pendingLabel="Création…">Créer le profil</SubmitButton>
          <button type="button" className="btn ghost small" onClick={() => setPw(suggestPassword())}>Proposer un mot de passe</button>
        </div>
      </ActionForm>
      {creds ? <SmsCard {...creds} siteUrl={siteUrl} /> : null}
    </>
  );
}

export function ManageMember({ m, siteUrl }: { m: { id: string; displayName: string; login: string | null; active: boolean; isHost: boolean; hasPassword: boolean }; siteUrl: string }) {
  const [creds, setCreds] = useState<Creds | null>(null);
  const [pw, setPw] = useState("");
  return (
    <div className="admin-forms">
      <ActionForm action={updateMemberAction} className="grid">
        <input type="hidden" name="id" value={m.id} />
        <label className="f-half">Prénom ou nom
          <input name="displayName" required maxLength={40} defaultValue={m.displayName} />
        </label>
        <label className="f-half">Identifiant
          <input name="login" required maxLength={30} defaultValue={m.login ?? ""} autoCapitalize="none" spellCheck={false} />
        </label>
        <div className="actions"><SubmitButton className="btn small">Enregistrer</SubmitButton></div>
      </ActionForm>

      {!m.isHost && m.login ? (
        <ActionForm action={resetPasswordAction} className="grid" resetOnSuccess
          onSuccess={(s: ActionState) => { setCreds(s.data as Creds); setPw(""); }}>
          <input type="hidden" name="id" value={m.id} />
          <input type="hidden" name="login" value={m.login} />
          <input type="hidden" name="displayName" value={m.displayName} />
          <label className="f-full">{m.hasPassword ? "Nouveau mot de passe provisoire" : "Mot de passe provisoire (active le profil)"}
            <input name="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
          </label>
          <div className="actions">
            <SubmitButton className="btn small">{m.hasPassword ? "Réinitialiser le mot de passe" : "Activer le profil"}</SubmitButton>
            <button type="button" className="btn ghost small" onClick={() => setPw(suggestPassword())}>Proposer</button>
          </div>
        </ActionForm>
      ) : null}
      {creds ? <SmsCard {...creds} siteUrl={siteUrl} /> : null}

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
      ) : <p className="hint">Ton propre mot de passe se change dans « Mon compte ».</p>}
    </div>
  );
}
