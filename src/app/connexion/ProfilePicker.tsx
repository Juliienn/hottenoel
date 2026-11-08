"use client";

import { useEffect, useRef, useState } from "react";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";

type Profile = { id: string; displayName: string; avatar: unknown; isHost: boolean };

/** Grille de profils façon « qui regarde ? ». Choisir une vignette ne fait
 * qu'ouvrir la demande de mot de passe : la connexion n'a lieu que si le
 * serveur valide le mot de passe de CE profil (cf. login dans auth/core). */
export function ProfilePicker({ profiles, next }: { profiles: Profile[]; next: string }) {
  const [selected, setSelected] = useState<Profile | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const tilesRef = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (selected) pwRef.current?.focus();
    else if (lastId.current) tilesRef.current?.querySelector<HTMLButtonElement>(`[data-id="${lastId.current}"]`)?.focus();
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  if (selected) {
    return (
      <div className="who-login" key={selected.id}>
        <div className="who-login-head">
          <Avatar avatar={selected.avatar} size={132} />
          <h3>{selected.displayName}</h3>
          {selected.isHost ? <span className="badge">Hôte</span> : null}
        </div>
        <ActionForm action={loginAction} className="grid who-form">
          <input type="hidden" name="profileId" value={selected.id} />
          <input type="hidden" name="suivant" value={next} />
          {/* Aide les gestionnaires de mots de passe à associer le bon profil. */}
          <input type="text" name="username" value={selected.displayName} autoComplete="username" readOnly hidden />
          <label className="f-full">Mot de passe de {selected.displayName}
            <input ref={pwRef} name="password" type="password" autoComplete="current-password" required maxLength={200} />
          </label>
          <div className="actions">
            <SubmitButton pendingLabel="Connexion…">Se connecter</SubmitButton>
            <button type="button" className="btn ghost" onClick={() => setSelected(null)}>Changer de profil</button>
          </div>
        </ActionForm>
      </div>
    );
  }

  return (
    <div className="who-grid" ref={tilesRef} role="list">
      {profiles.map((p, i) => (
        <div role="listitem" key={p.id} style={{ ["--i" as string]: i }}>
          <button type="button" className="who-tile" data-id={p.id} aria-label={`Profil de ${p.displayName}${p.isHost ? " (Hôte)" : ""}`}
            onClick={() => { lastId.current = p.id; setSelected(p); }}>
            <span className="who-av"><Avatar avatar={p.avatar} size={120} /></span>
            <span className="who-name">{p.displayName}</span>
            {p.isHost ? <span className="badge">Hôte</span> : null}
          </button>
        </div>
      ))}
    </div>
  );
}
