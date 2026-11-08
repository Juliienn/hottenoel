import Link from "next/link";
import { requireUser } from "@/lib/auth/next";
import { familyMembers, memberList } from "@/lib/services/wishlist";
import { claimAction, unclaimAction } from "@/app/actions/wishlist";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { GiftTag } from "@/components/GiftTag";
import { plural } from "@/lib/format";
import { AppError } from "@/lib/services/errors";
import { notFound, redirect } from "next/navigation";

export const metadata = { title: "La famille" };

const BANDS: Array<[string, string, (c: number | null) => boolean]> = [
  ["tous", "Tous les prix", () => true],
  ["moins-25", "Moins de 25 €", (c) => c != null && c < 2500],
  ["25-75", "25 à 75 €", (c) => c != null && c >= 2500 && c <= 7500],
  ["plus-75", "Plus de 75 €", (c) => c != null && c > 7500],
  ["libre", "Prix libre", (c) => c == null],
];

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ membre?: string; prix?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  if (sp.membre === user.id) redirect("/ma-liste");
  const others = await familyMembers(user);
  if (!others.length) {
    return <div className="empty">Personne d&apos;autre n&apos;a encore de compte. L&apos;Hôte peut créer les profils de la famille depuis l&apos;Espace Hôte.</div>;
  }
  const viewingId = sp.membre && others.some((o) => o.id === sp.membre) ? sp.membre : others[0].id;
  let data;
  try {
    data = await memberList(user, viewingId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const band = BANDS.find((b) => b[0] === sp.prix) ?? BANDS[0];
  const list = data.items.filter((it) => band[2](it.priceCents));
  const free = data.items.filter((it) => it.state.kind === "free").length;
  const name = data.member.displayName;
  const q = (extra: Record<string, string>) => `/famille?${new URLSearchParams({ membre: viewingId, ...extra })}`;

  return (
    <div className="panel">
      <div className="people">
        {others.map((o) => (
          <Link key={o.id} href={`/famille?membre=${o.id}`} aria-current={o.id === viewingId ? "page" : undefined}>
            <Avatar avatar={o.avatar} size={26} />{o.displayName}<span className="count">{o.itemCount}</span>
          </Link>
        ))}
      </div>

      <div className="box">
        <div className="person-head">
          <Avatar avatar={data.member.avatar} size={64} />
          <div>
            <h2>La liste de {name}</h2>
            <p className="hint">{plural(data.items.length, "idée", "idées")} · {free} encore libre{free > 1 ? "s" : ""}. {name} ne voit pas ce que tu réserves.</p>
            {data.member.about ? <p className="about">{data.member.about}</p> : null}
          </div>
        </div>
      </div>

      <div className="filters" aria-label="Filtrer par prix">
        {BANDS.map(([k, label]) => <Link key={k} href={q({ prix: k })} aria-current={k === band[0] ? "true" : undefined}>{label}</Link>)}
      </div>

      {!data.items.length ? <div className="empty">{name} n&apos;a encore rien ajouté.</div>
        : !list.length ? <div className="empty">Aucune idée dans cette tranche de prix.</div>
        : (
          <div className="tags">
            {list.map((it) => (
              <GiftTag key={it.id} item={it} taken={it.state.kind === "taken"}>
                <div className="foot">
                  {it.state.kind === "free" ? (
                    <>
                      <span className="pill free">Libre</span>
                      <ActionForm action={claimAction}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <SubmitButton className="btn claim small" pendingLabel="Réservation…">Je l&apos;offre</SubmitButton>
                      </ActionForm>
                    </>
                  ) : it.state.kind === "mine" ? (
                    <>
                      <span className="pill mine">Tu l&apos;offres</span>
                      <ActionForm action={unclaimAction}>
                        <input type="hidden" name="itemId" value={it.id} />
                        <SubmitButton className="btn ghost small">Annuler</SubmitButton>
                      </ActionForm>
                    </>
                  ) : (
                    <span className="pill other">Pris par {it.state.by}</span>
                  )}
                </div>
              </GiftTag>
            ))}
          </div>
        )}
    </div>
  );
}
