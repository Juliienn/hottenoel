"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionState } from "@/app/actions/run";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

/** Formulaire relié à une action serveur, avec message de résultat.
 *
 * Soumis via onSubmit plutôt que via l'attribut action : avec action={…},
 * React 19 vide tous les champs après chaque envoi, y compris quand le
 * serveur répond par une erreur (vu en test : après « mot de passe
 * incorrect », l'identifiant et le prénom étaient effacés). Ici les champs
 * ne sont vidés que sur succès, et seulement si resetOnSuccess. */
export function ActionForm({
  action, children, className, resetOnSuccess = false, showStatus = true, onSuccess,
}: {
  action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; showStatus?: boolean;
  onSuccess?: (state: ActionState) => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.key) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    if (state.ok) onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.key]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {showStatus && (state.error || state.message) ? (
        <p className={`status ${state.error ? "err" : "ok"}`} role={state.error ? "alert" : "status"} style={{ gridColumn: "1 / -1" }}>
          {state.error || state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SubmitButton({ children, className = "btn", pendingLabel, disabled }: { children: ReactNode; className?: string; pendingLabel?: string; disabled?: boolean }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/** Bouton en deux temps : le premier clic demande confirmation (les fenêtres
 * confirm() du navigateur sont évitées, illisibles sur mobile). */
export function ConfirmSubmit({ label, confirmLabel, className = "btn danger small", disabled }: { label: string; confirmLabel: string; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  const pending = useContext(PendingContext);
  if (!armed) return <button type="button" className={className} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="confirm-row">
      <button type="submit" className={className} disabled={pending}>{confirmLabel}</button>
      <button type="button" className="btn ghost small" onClick={() => setArmed(false)}>Annuler</button>
    </span>
  );
}
