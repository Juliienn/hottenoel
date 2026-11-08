// Champs communs aux formulaires de création et de modification d'un événement.
export function EventFields({ ev, lockDrawDate = false }: {
  ev?: { name: string; giftDate: string; drawDate: string; budgetCents: number | null; budgetKind: string };
  lockDrawDate?: boolean;
}) {
  return (
    <>
      <label className="f-full">Nom de l&apos;événement
        <input name="name" required maxLength={80} placeholder="Noël 2026" defaultValue={ev?.name} />
      </label>
      <label className="f-third">Date du tirage au sort
        <input name="drawDate" type="date" required defaultValue={ev?.drawDate} readOnly={lockDrawDate} />
      </label>
      <label className="f-third">Date de remise des cadeaux
        <input name="giftDate" type="date" required defaultValue={ev?.giftDate} />
      </label>
      <label className="f-third">Budget par cadeau (€)
        <input name="budget" type="number" min="0" step="1" inputMode="numeric" placeholder="30"
          defaultValue={ev?.budgetCents != null ? String(ev.budgetCents / 100) : ""} />
      </label>
      <label className="f-half">Type de budget
        <select name="budgetKind" defaultValue={ev?.budgetKind ?? "MAX"}>
          <option value="MAX">Maximum à ne pas dépasser</option>
          <option value="INDICATIF">Indicatif</option>
        </select>
      </label>
    </>
  );
}

export function budgetLabel(cents: number | null, kind: string): string {
  if (cents == null) return "Pas de budget fixé";
  const v = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
  return kind === "MAX" ? `${v} maximum` : `Environ ${v}`;
}

export function StatusPill({ status, past }: { status: string; past: boolean }) {
  if (past) return <span className="pill past">Terminé</span>;
  return status === "DRAWN" ? <span className="pill done">Tirage effectué</span> : <span className="pill wait">Tirage en attente</span>;
}
