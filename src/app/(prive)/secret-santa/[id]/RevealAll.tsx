"use client";

import { useActionState, useState } from "react";
import { revealAction } from "@/app/actions/admin";

/** Affichage de toutes les attributions : réservé à l'Hôte, derrière une
 * confirmation explicite, et jamais chargé tant qu'il ne l'a pas demandé
 * (le serveur ne les envoie qu'à cet appel). */
export function RevealAll({ eventId, hostParticipates }: { eventId: string; hostParticipates: boolean }) {
  const [armed, setArmed] = useState(false);
  const [state, action, pending] = useActionState(revealAction, {});
  const rows = (state.data as Array<{ giver: string; receiver: string }> | undefined) ?? null;

  if (rows) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <ul className="list-plain">
          {rows.map((r) => <li key={r.giver}><span><b>{r.giver}</b> offre à <b>{r.receiver}</b></span></li>)}
        </ul>
        <p className="hint">Ces informations ne sont visibles que par toi. Rafraîchis la page pour les masquer.</p>
      </div>
    );
  }
  if (!armed) {
    return <button type="button" className="btn ghost small" onClick={() => setArmed(true)}>Afficher toutes les attributions</button>;
  }
  return (
    <form action={action} className="confirm-row">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="id" value={eventId} />
      <span className="hint">{hostParticipates ? "Tu participes : tu vas découvrir qui t'offre ton cadeau." : "À n'utiliser qu'en cas de besoin (oubli, désistement)."}</span>
      <button type="submit" className="btn danger small" disabled={pending}>Oui, afficher</button>
      <button type="button" className="btn ghost small" onClick={() => setArmed(false)}>Annuler</button>
      {state.error ? <p className="status err">{state.error}</p> : null}
    </form>
  );
}
