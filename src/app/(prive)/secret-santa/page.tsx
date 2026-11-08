import Link from "next/link";
import { requireUser } from "@/lib/auth/next";
import { listEvents } from "@/lib/services/santa";
import { familyMembers } from "@/lib/services/wishlist";
import { createEventAction } from "@/app/actions/admin";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Ornament } from "@/components/Decorations";
import { formatDayFr } from "@/lib/parisTime";
import { budgetLabel, EventFields, StatusPill } from "./EventFields";

export const metadata = { title: "Secret Santa" };

export default async function SantaPage() {
  const user = await requireUser();
  const events = await listEvents(user);
  const isHost = user.role === "HOST";
  const candidates = isHost ? await familyMembers(user) : [];

  return (
    <div className="panel">
      <p className="notice">Chaque participant offre un cadeau à une seule personne, tirée au sort. Après le tirage, tu découvres ici à qui tu offres, et personne d&apos;autre ne le sait.</p>

      {events.length ? (
        <div className="events">
          {events.map((e) => (
            <Link key={e.id} href={`/secret-santa/${e.id}`} className="event-card">
              <Ornament />
              <h3>{e.name}</h3>
              <StatusPill status={e.status} past={e.past} />
              <span className="hint">Cadeaux le {formatDayFr(e.giftDate)}</span>
              <span className="hint">{budgetLabel(e.budgetCents, e.budgetKind)} · {e.participantCount} participant{e.participantCount > 1 ? "s" : ""}</span>
              {isHost && !e.isParticipant ? <span className="hint">Tu organises sans participer.</span> : null}
            </Link>
          ))}
        </div>
      ) : (
        <div className="empty">{isHost ? "Aucun événement pour l'instant. Crée le premier ci-dessous." : "Aucun Secret Santa ne te concerne pour l'instant. L'Hôte t'ajoutera aux prochains."}</div>
      )}

      {isHost ? (
        <div className="box">
          <h2>Créer un événement</h2>
          <ActionForm action={createEventAction} className="grid">
            <EventFields />
            <fieldset className="f-full" style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: 8 }}>
              <legend className="lbl" style={{ marginBottom: 8 }}>Participants (modifiables jusqu&apos;au tirage)</legend>
              <div className="checks">
                <label><input type="checkbox" name="participants" value={user.id} defaultChecked /> {user.displayName} (toi)</label>
                {candidates.map((c) => (
                  <label key={c.id}><input type="checkbox" name="participants" value={c.id} defaultChecked /> {c.displayName}</label>
                ))}
              </div>
            </fieldset>
            <div className="actions"><SubmitButton pendingLabel="Création…">Créer l&apos;événement</SubmitButton></div>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
