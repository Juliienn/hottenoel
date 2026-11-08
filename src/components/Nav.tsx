"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ isHost }: { isHost: boolean }) {
  const path = usePathname();
  const tabs: Array<[string, string, string?]> = [
    ["/ma-liste", "Ma liste"],
    ["/famille", "La famille"],
    ["/mes-cadeaux", "Ce que j'offre"],
    ["/secret-santa", "Secret Santa"],
  ];
  if (isHost) tabs.push(["/hote", "Espace Hôte", "host"]);
  return (
    <nav className="tabs" aria-label="Navigation principale">
      {tabs.map(([href, label, cls]) => (
        <Link key={href} href={href} className={cls} aria-current={path === href || path.startsWith(href + "/") ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
