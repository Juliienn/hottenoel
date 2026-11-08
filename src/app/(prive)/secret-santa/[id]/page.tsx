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
import { RevealLauncher } from "./SantaReveal";
import { NotifyPanel } from "./NotifyPanel";
import { headers } from "next/headers";
import { eventMessages, messageRecipients } from "@/lib/services/santaMessages";
import { smsProviderLabel } from "@/lib/services/sms";
import { announceMessage, drawMessage } from "@/lib/santaMessages";

export const metadata = { title: "Secret Santa" };

export default async function EventPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ annonce?: string; tirage?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
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
  // Accès à l'événement vérifié par getEvent ci-dessus (participant ou Hôte).
  const messages = await eventMessages(user, id);
  let notify = null;
  if (admin) {
    const h = await headers();
    const siteUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    const recipients = (await messageRecipients(user, id)).map(({ id: rid, displayName, phone }) => ({ id: rid, displayName, phone }));
    const names = admin.participants.map((p) => p.displayName);
    notify = {
      recipients, provider: smsProviderLabel(),
      annonce: announceMessage(ev, names, siteUrl),
      tirage: ev.status === "DRAWN" ? drawMessage(ev, siteUrl) : null,
    };
  }
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

      {notify && sp.annonce && admin && admin.participants.length ? (
        <NotifyPanel eventId={id} kind="ANNONCE" defaultText={notify.annonce} recipients={notify.recipients} provider={notify.provider} ask />
      ) : null}
      {notify?.tirage && sp.tirage ? (
        <NotifyPanel eventId={id} kind="TIRAGE" defaultText={notify.tirage} recipients={notify.recipients} provider={notify.provider} ask />
      ) : null}

      {ev.isParticipant ? (
        ev.myDraw.state === "hidden" ? (
          <div className="sr-teaser">
            <p className="sr-teaser-t">Le tirage a eu lieu ! <span aria-hidden="true">🎄</span></p>
            <p className="hint">Ton destinataire t&apos;attend dans ce paquet. Monte le son…</p>
            <RevealLauncher eventId={id} eventName={ev.name} seen={false} />
          </div>
        ) : ev.myDraw.state === "seen" ? (
          <div className="reveal" role="status">
            <Avatar avatar={ev.myDraw.receiver.avatar} size={72} />
            <div>
              <p>Tu dois offrir un cadeau à :</p>
              <p className="to">{ev.myDraw.receiver.displayName}</p>
              <p className="hint" style={{ color: "inherit" }}>C&apos;est secret : garde-le pour toi !{" "}
                <Link href={`/famille?membre=${ev.myDraw.receiver.id}`} style={{ color: "inherit" }}>Voir sa liste de Noël</Link>
              </p>
            </div>
            <div style={{ marginLeft: "auto" }}><RevealLauncher eventId={id} eventName={ev.name} seen /></div>
          </div>
        ) : ev.status === "DRAWN" ? null : (
          <div className="empty">Le tirage n&apos;a pas encore eu lieu. Reviens après le {formatDayFr(ev.drawDate)} pour découvrir à qui tu offres un cadeau.</div>
        )
      ) : null}

      {messages.length ? (
        <div className="box">
          <h2><span aria-hidden="true">📣</span> Messages de l&apos;Hôte</h2>
          <ul className="santa-msgs">
            {messages.map((m) => (
              <li key={m.id} className={m.isNew ? "new" : undefined}>
                <span className="hint">
                  {m.kind === "TIRAGE" ? "Annonce du tirage" : "Annonce de l'événement"} · {m.createdAt.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" })}
                  {m.isNew ? <span className="pill mine" style={{ marginLeft: 8 }}>Nouveau</span> : null}
                </span>
                <p>{m.text}</p>
              </li>
            ))}
          </ul>
        </div>
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

          {notify && admin.participants.length ? (
            <div className="box">
              <h2>Prévenir les participants</h2>
              <p className="hint">Le message est affiché sur le site aux seuls participants de cet événement{notify.provider ? `, et peut partir par SMS via ${notify.provider}` : ", et tu peux l'ouvrir dans ton application SMS"}.</p>
              <div className="confirm-row" style={{ marginTop: 10 }}>
                <NotifyPanel eventId={id} kind="ANNONCE" defaultText={notify.annonce} recipients={notify.recipients} provider={notify.provider} ask={false} label="Annoncer l'événement" />
                {notify.tirage ? <NotifyPanel eventId={id} kind="TIRAGE" defaultText={notify.tirage} recipients={notify.recipients} provider={notify.provider} ask={false} label="Annoncer le tirage" /> : null}
              </div>
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

            </>
          ) : null}

          {/* Suppression possible à tout moment, tirage effectué ou événement terminé compris. */}
          <div className="box">
            <h2>Supprimer l&apos;événement</h2>
            {ev.status === "DRAWN" ? (
              <p className="notice warn" style={{ marginTop: 8 }}>
                Le tirage a déjà eu lieu : supprimer l&apos;événement efface aussi son résultat, définitivement. Les participants ne pourront plus voir à qui ils offrent, et ce tirage ne pourra pas être retrouvé.
              </p>
            ) : null}
            <ActionForm action={deleteEventAction} className="grid">
              <input type="hidden" name="id" value={id} />
              {ev.status === "DRAWN" ? <input type="hidden" name="confirmDrawn" value="1" /> : null}
              <div className="actions">
                <ConfirmSubmit label="Supprimer cet événement"
                  confirmLabel={ev.status === "DRAWN" ? "Supprimer définitivement, tirage compris" : "Supprimer définitivement"} />
              </div>
            </ActionForm>
          </div>
        </>
      ) : null}
    </div>
  );
}
