import { avatarSvg } from "@/lib/avatar";

// Le SVG est construit uniquement à partir des tables de src/lib/avatar.ts
// (clés validées), jamais à partir de texte libre : l'injection est sûre.
export function Avatar({ avatar, size, label }: { avatar: unknown; size: number; label?: string }) {
  return (
    <span
      className="avwrap"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: avatarSvg(avatar) }}
    />
  );
}
