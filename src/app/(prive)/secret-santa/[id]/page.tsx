import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/next";
import { getEvent, getEventAdmin, MIN_PARTICIPANTS } from "@/lib/services/santa";
import { AppError } from "@/lib/services/errors";
import {
  addExclusionAction, deleteEventAction, drawAction, removeExclusionAction, setParticipantsAction, updateEventAction,
} from "@/app/actions/admin";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { daysBetween, formatDayFr, parisDayKey } from "@/lib/parisTime";
import { budgetLabel, EventFields, StatusPill } from "../EventFields";
import { RevealAll } from "./RevealAll";

export const metadata = { title: "Secret Santa" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let ev;
  try {
    ev = await getEvent(user, id);
  } catch (e) {
    // Non participant ou identifiant inventé : même page 404.
    if (e instanceof AppError) notFound();
    throw e;
  }
  const isHost = user.role === "HOST";
  const admin = isHost ? await getEventAdmin(user, id) : null;
  const today = parisDayKey();
  const drawDue = daysBetween(today, ev.drawDate) <= 0;
  const open = ev.status === "OPEN" && !ev.past;

  return (
    <div className="panel">
      <p><Link href="/secret-santa">← Tous les Secret Santa</Link></p>

      <div className="box" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontSize: 28 }}>{ev.name}</h2>
          <StatusPill status={ev.status} past={ev.past} />
        </div>
        <dl className="facts">
          <div><dt>Tirage au sort</dt><dd>{formatDayFr(ev.drawDate)}</dd></div>
          <div><dt>Remise des cadeaux</dt><dd>{formatDayFr(ev.giftDate)}</dd></div>
          <div><dt>Budget</dt><dd>{budgetLabel(ev.budgetCents, ev.budgetKind)}</dd></div>
          <div><dt>Participants</dt><dd>{ev.participantCount}</dd></div>
        </dl>
      </div>

      {ev.isParticipant ? (
        ev.myReceiver ? (
          <div className="reveal" role="status">
            <Avatar avatar={ev.myReceiver.avatar} size={72} />
            <div>
              <p>Tu dois offrir un cadeau à :</p>
              <p className="to">{ev.myReceiver.displayName}</p>
              <p className="hint" style={{ color: "inherit" }}>C&apos;est secret : garde-le pour toi !{" "}
                <Link href={`/famille?membre=${ev.myReceiver.id}`} style={{ color: "inherit" }}>Voir sa liste de Noël</Link>
              </p>
            </div>
          </div>
        ) : (
          <div className="empty">Le tirage n&apos;a pas encore eu lieu. Reviens après le {formatDayFr(ev.drawDate)} pour découvrir à qui tu offres un cadeau.</div>
        )
      ) : null}

      {admin ? (
        <>
          <h2 className="section-title" style={{ marginTop: 8 }}>Organisation <span className="badge">Hôte</span></h2>

          {ev.status === "DRAWN" ? (
            <div className="box">
              <h2>Résultat du tirage</h2>
              <p className="hint">Tirage enregistré : il ne sera jamais relancé. Chaque participant voit uniquement son propre destinataire.</p>
              <ul className="list-plain" style={{ marginTop: 12 }}>
                {admin.participants.map((p) => (
                  <li key={p.id}>
                    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}><Avatar avatar={p.avatar} size={26} />{p.displayName}</span>
                    {p.viewed ? <span className="pill done">A découvert son tirage</span> : <span className="pill wait">Pas encore consulté</span>}
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 12 }}><RevealAll eventId={id} hostParticipates={ev.isParticipant} /></div>
            </div>
          ) : null}

          {open ? (
            <div className="box">
              <h2>Lancer le tirage</h2>
              {admin.participants.length < MIN_PARTICIPANTS ? (
                <p className="hint">Il faut au moins {MIN_PARTICIPANTS} participants.</p>
              ) : !drawDue ? (
                <p className="hint">Le tirage est prévu le {formatDayFr(ev.drawDate)}. Le bouton apparaîtra ce jour-là ; avance la date ci-dessous pour tirer plus tôt.</p>
              ) : (
                <ActionForm action={drawAction} className="grid">
                  <input type="hidden" name="id" value={id} />
                  <p className="hint f-full">Chacun des {admin.participants.length} participants recevra une seule personne, jamais lui-même, en respectant les {admin.exclusions.length} exclusion{admin.exclusions.length > 1 ? "s" : ""}. Le résultat est définitif.</p>
                  <div className="actions"><ConfirmSubmit label="Tirer au sort" confirmLabel="Confirmer le tirage définitif" className="btn gold" /></div>
                </ActionForm>
              )}
            </div>
          ) : null}

          {!ev.past ? (
            <div className="box">
              <h2>Informations</h2>
              <ActionForm action={updateEventAction} className="grid">
                <input type="hidden" name="id" value={id} />
                <EventFields ev={ev} lockDrawDate={ev.status === "DRAWN"} />
                <div className="actions"><SubmitButton className="btn small">Enregistrer</SubmitButton></div>
              </ActionForm>
            </div>
          ) : (
            <p className="notice">Événement terminé : il reste consultable, sans modification possible.</p>
          )}

          {open ? (
            <>
              <div className="box">
                <h2>Participants</h2>
                <ActionForm action={setParticipantsAction} className="grid">
                  <input type="hidden" name="id" value={id} />
                  <div className="checks f-full">
                    {admin.candidates.map((c) => (
                      <label key={c.id}>
                        <input type="checkbox" name="participants" value={c.id} defaultChecked={admin.participants.some((p) => p.id === c.id)} />
                        {c.displayName}{c.id === user.id ? " (toi)" : ""}
                      </label>
                    ))}
                  </div>
                  <div className="actions"><SubmitButton className="btn small">Enregistrer les participants</SubmitButton></div>
                </ActionForm>
              </div>

              <div className="box">
                <h2>Exclusions</h2>
                <p className="hint">Exemple : un couple qui ne veut pas s&apos;offrir de cadeau entre eux. Le tirage les respectera toutes.</p>
                {admin.exclusions.length ? (
                  <ul className="list-plain" style={{ marginTop: 12 }}>
                    {admin.exclusions.map((x) => (
                      <li key={x.id}>
                        <span><b>{x.giver}</b> ne doit pas offrir à <b>{x.receiver}</b></span>
                        <ActionForm action={removeExclusionAction}>
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="exclusionId" value={x.id} />
                          <SubmitButton className="btn ghost small">Retirer</SubmitButton>
                        </ActionForm>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {admin.participants.length >= 2 ? (
                  <ActionForm action={addExclusionAction} className="grid">
                    <input type="hidden" name="id" value={id} />
                    <label className="f-third">Personne
                      <select name="giver" required>{admin.participants.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
                    </label>
                    <label className="f-third">ne doit pas offrir à
                      <select name="receiver" required defaultValue={admin.participants[1]?.id}>{admin.participants.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}</select>
                    </label>
                    <label className="check f-third" style={{ alignSelf: "end", paddingBottom: 10 }}>
                      <input type="checkbox" name="both" value="1" /> dans les deux sens
                    </label>
                    <div className="actions"><SubmitButton className="btn small">Ajouter l&apos;exclusion</SubmitButton></div>
                  </ActionForm>
                ) : <p className="hint">Ajoute d&apos;abord des participants.</p>}
              </div>

              <div className="box">
                <h2>Supprimer l&apos;événement</h2>
                <ActionForm action={deleteEventAction} className="grid">
                  <input type="hidden" name="id" value={id} />
                  <div className="actions"><ConfirmSubmit label="Supprimer cet événement" confirmLabel="Supprimer définitivement" /></div>
                </ActionForm>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
