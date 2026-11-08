"use client";

import { useState } from "react";
import { AV, normalizeAvatar, type Avatar as AvatarValue, type AvatarKey } from "@/lib/avatar";
import { Avatar } from "./Avatar";

/** Créateur d'avatar : sa valeur part avec le formulaire dans un champ caché. */
export function AvatarBuilder({ initial, name = "avatar", disabled = false }: { initial: unknown; name?: string; disabled?: boolean }) {
  const [value, setValue] = useState<AvatarValue>(() => normalizeAvatar(initial));
  const set = (k: AvatarKey, v: string) => setValue((cur) => ({ ...cur, [k]: v }));

  const swatches = (k: "skin" | "hairColor" | "eyes" | "sweater") =>
    (AV[k] as readonly (readonly string[])[]).map(([key, label, color]) => (
      <button key={key} type="button" className="sw" style={{ ["--sw" as string]: color }} aria-label={label} title={label}
        aria-pressed={value[k] === key} disabled={disabled} onClick={() => set(k, key)} />
    ));

  return (
    <div className="avb">
      <input type="hidden" name={name} value={JSON.stringify(value)} />
      <div className="avb-preview"><Avatar avatar={value} size={120} label="Aperçu de l'avatar" /></div>
      <div className="avb-opts">
        <div className="avb-group"><span>Sexe</span><div className="avb-row">
          {AV.sex.map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={value.sex === k} disabled={disabled} onClick={() => set("sex", k)}>{l}</button>
          ))}
        </div></div>
        <div className="avb-group"><span>Coiffure</span><div className="avb-row">
          {AV.hair.map(([k, l]) => (
            <button key={k} type="button" className="hairopt" aria-label={l} title={l} aria-pressed={value.hair === k} disabled={disabled} onClick={() => set("hair", k)}>
              <Avatar avatar={{ ...value, hair: k }} size={46} />
            </button>
          ))}
        </div></div>
        <div className="avb-group"><span>Peau</span><div className="avb-row">{swatches("skin")}</div></div>
        <div className="avb-group"><span>Cheveux</span><div className="avb-row">{swatches("hairColor")}</div></div>
        <div className="avb-group"><span>Yeux</span><div className="avb-row">{swatches("eyes")}</div></div>
        <div className="avb-group"><span>Pull</span><div className="avb-row">{swatches("sweater")}</div></div>
      </div>
    </div>
  );
}
