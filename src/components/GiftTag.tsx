import type { ReactNode } from "react";
import { fmtPrice, hostOf, safeHref } from "@/lib/format";

export type TagItem = { title: string; priceCents: number | null; link: string; note: string; wish: number };

/** Étiquette kraft d'un cadeau (contenu commun à toutes les listes). */
export function GiftTag({ item, children, taken = false }: { item: TagItem; children?: ReactNode; taken?: boolean }) {
  const href = item.link ? safeHref(item.link) : null;
  const wish = Math.min(3, Math.max(1, item.wish));
  return (
    <article className={`tag${taken ? " taken" : ""}`}>
      <div className="row"><h3>{item.title}</h3><span className="price">{fmtPrice(item.priceCents)}</span></div>
      <span className="wish" aria-label={`Envie ${wish} sur 3`}>{"★".repeat(wish)}{"☆".repeat(3 - wish)}</span>
      {item.note ? <p className="note">{item.note}</p> : null}
      {href ? <a href={href} target="_blank" rel="noopener noreferrer">Voir sur {hostOf(href)} ↗</a> : null}
      {children}
    </article>
  );
}
