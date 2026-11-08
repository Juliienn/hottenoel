import Link from "next/link";
import { requireUser } from "@/lib/auth/next";
import { myGifts } from "@/lib/services/wishlist";
import { unclaimAction } from "@/app/actions/wishlist";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Avatar } from "@/components/Avatar";
import { euro, fmtPrice } from "@/lib/format";

export const metadata = { title: "Ce que j'offre" };

export default async function MyGiftsPage() {
  const user = await requireUser();
  const groups = await myGifts(user);
  if (!groups.length) {
    return <div className="empty">Tu n&apos;as encore rien réservé. Va dans <Link href="/famille">La famille</Link> et choisis un cadeau avec « Je l&apos;offre ».</div>;
  }
  let total = 0, unknown = 0;
  for (const g of groups) for (const l of g.lines) if (!l.removed) { if (l.priceCents == null) unknown++; else total += l.priceCents; }
  return (
    <div className="box" style={{ display: "grid", gap: 18 }}>
      {groups.map((g) => (
        <div key={g.owner.id} className="gift-group">
          <h3><Avatar avatar={g.owner.avatar} size={30} /><span>Pour {g.owner.displayName}</span></h3>
          {g.lines.map((l) => (
            <div key={l.itemId} className="gift-line">
              {l.removed ? (
                <>
                  <span className="t">« {l.title} » a été retiré de la liste par {g.owner.displayName}</span>
                  <ActionForm action={unclaimAction}>
                    <input type="hidden" name="itemId" value={l.itemId} />
                    <SubmitButton className="btn ghost small">Oublier</SubmitButton>
                  </ActionForm>
                </>
              ) : (
                <>
                  <span className="t">{l.title}</span>
                  <span className="p">{fmtPrice(l.priceCents)}</span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <div className="total"><span>Budget estimé</span><span>{euro(total)}{unknown ? ` + ${unknown} prix libre${unknown > 1 ? "s" : ""}` : ""}</span></div>
    </div>
  );
}
