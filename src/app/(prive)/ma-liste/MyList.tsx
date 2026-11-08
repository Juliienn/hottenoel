"use client";

import { useState } from "react";
import { deleteItemAction, saveItemAction } from "@/app/actions/wishlist";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/ActionForm";
import { GiftTag } from "@/components/GiftTag";

type Item = { id: string; title: string; priceCents: number | null; link: string; note: string; wish: number };

export function MyList({ items }: { items: Item[] }) {
  const [editing, setEditing] = useState<Item | null>(null);
  // Changer de clé remonte le formulaire : ses champs reprennent les valeurs par défaut.
  const [formKey, setFormKey] = useState(0);
  const reset = () => { setEditing(null); setFormKey((k) => k + 1); };

  return (
    <>
      <div className="box" id="formulaire">
        <h2>{editing ? "Modifier l'idée" : "Ajouter une idée de cadeau"}</h2>
        <ActionForm key={formKey} action={saveItemAction} className="grid" resetOnSuccess onSuccess={() => { if (editing) reset(); }}>
          <input type="hidden" name="id" value={editing?.id ?? ""} />
          <label className="f-title">Cadeau
            <input name="title" maxLength={120} required placeholder="Un livre de Sylvain Tesson" defaultValue={editing?.title} />
          </label>
          <label className="f-price">Prix indicatif (€)
            <input name="price" type="number" min="0" step="0.01" inputMode="decimal" placeholder="25"
              defaultValue={editing?.priceCents != null ? (editing.priceCents / 100).toString() : ""} />
          </label>
          <label className="f-link">Lien (facultatif)
            <input name="link" type="url" maxLength={600} placeholder="https://…" defaultValue={editing?.link} />
          </label>
          <label className="f-wish">Envie
            <select name="wish" defaultValue={String(editing?.wish ?? 2)}>
              <option value="1">★ ça me ferait plaisir</option>
              <option value="2">★★ j&apos;aimerais bien</option>
              <option value="3">★★★ j&apos;en rêve</option>
            </select>
          </label>
          <label className="f-note">Précisions (taille, couleur, modèle…)
            <textarea name="note" maxLength={500} defaultValue={editing?.note} />
          </label>
          <div className="actions">
            <SubmitButton pendingLabel="Enregistrement…">{editing ? "Enregistrer" : "Ajouter à ma liste"}</SubmitButton>
            {editing ? <button type="button" className="btn ghost" onClick={reset}>Annuler la modification</button> : null}
          </div>
        </ActionForm>
      </div>

      <div>
        <h2 className="section-title">Ma liste {items.length ? <span className="hint">· {items.length} idée{items.length > 1 ? "s" : ""}</span> : null}</h2>
        {!items.length ? (
          <div className="empty">Ta liste est vide. Ajoute ta première idée avec le formulaire ci-dessus.</div>
        ) : (
          <div className="tags">
            {items.map((it) => (
              // Volontairement : aucune information de réservation ici (le serveur n'en envoie pas).
              <GiftTag key={it.id} item={it}>
                <div className="foot">
                  <button type="button" className="btn ghost small" onClick={() => {
                    setEditing(it); setFormKey((k) => k + 1);
                    document.getElementById("formulaire")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}>Modifier</button>
                  <ActionForm action={deleteItemAction}>
                    <input type="hidden" name="id" value={it.id} />
                    <ConfirmSubmit label="Supprimer" confirmLabel="Confirmer la suppression" />
                  </ActionForm>
                </div>
              </GiftTag>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
