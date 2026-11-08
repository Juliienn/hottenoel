"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { id: string; kind: "ANNONCE" | "TIRAGE"; eventId: string; eventName: string };

/** Bandeau des messages Secret Santa non lus. Le layout n'est pas recalculé à
 * chaque navigation : un message est masqué dès que sa page a été ouverte
 * (le serveur l'a alors marqué comme lu). */
export function SantaBanner({ items }: { items: Item[] }) {
  const path = usePathname();
  const [read, setRead] = useState<Set<string>>(new Set());
  useEffect(() => {
    const opened = items.filter((m) => path === `/secret-santa/${m.eventId}`).map((m) => m.id);
    if (opened.length) setRead((r) => new Set([...r, ...opened]));
  }, [path, items]);
  const visible = items.filter((m) => !read.has(m.id) && path !== `/secret-santa/${m.eventId}`);
  if (!visible.length) return null;
  return (
    <div className="santa-banner" role="status">
      {visible.map((m) => (
        <Link key={m.id} href={`/secret-santa/${m.eventId}`}>
          <span aria-hidden="true">{m.kind === "TIRAGE" ? "🎁" : "📣"}</span>{" "}
          {m.kind === "TIRAGE" ? <>Le tirage de <b>{m.eventName}</b> a eu lieu : découvre à qui tu offres !</> : <>Nouveau message de l&apos;Hôte : <b>{m.eventName}</b></>}
          <span className="santa-banner-go">Lire →</span>
        </Link>
      ))}
    </div>
  );
}
