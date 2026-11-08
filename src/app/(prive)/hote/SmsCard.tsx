"use client";

import { useState } from "react";

/** Message prêt à envoyer par SMS au membre, avec ses identifiants.
 * Le lien sms: ouvre l'application Messages du téléphone (sans garantie sur
 * ordinateur) ; le bouton Copier fonctionne partout. */
export function SmsCard({ displayName, login, password, siteUrl }: { displayName: string; login: string; password: string; siteUrl: string }) {
  const text = `Coucou ${displayName} ! Voici tes accès à La Hotte familiale, notre site de listes de Noël : ${siteUrl}/connexion\nIdentifiant : ${login}\nMot de passe provisoire : ${password}\nTu choisiras ton propre mot de passe à la première connexion.`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="sms">
      <span className="lbl">Message à envoyer par SMS</span>
      <pre>{text}</pre>
      <div className="confirm-row">
        <a className="btn small" href={`sms:?&body=${encodeURIComponent(text)}`}>Ouvrir dans Messages</a>
        <button type="button" className="btn ghost small" onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
        }}>{copied ? "Copié !" : "Copier le message"}</button>
      </div>
      <p className="hint">Ce mot de passe ne sera plus jamais affiché : il est stocké chiffré (haché) et le membre devra le remplacer.</p>
    </div>
  );
}
