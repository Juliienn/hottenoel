import Link from "next/link";
import { requireUser } from "@/lib/auth/next";
import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/Avatar";
import { Nav } from "@/components/Nav";
import { unreadSantaMessages } from "@/lib/services/santaMessages";
import { SantaBanner } from "@/components/SantaBanner";

// Toutes les pages de ce groupe exigent une session valide (relue en base).
// Le middleware a déjà renvoyé les visiteurs sans cookie vers /connexion.
export const dynamic = "force-dynamic";

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser({ allowMustChange: true });
  const ready = !user.mustChangePassword;
  // Messages de l'Hôte non lus, pour les événements dont l'utilisateur est participant.
  const unread = ready ? await unreadSantaMessages(user) : [];
  return (
    <>
      <div className="userbar">
        <Link href="/compte" className="me">
          <Avatar avatar={user.avatar} size={28} />
          <span>{user.displayName}</span>
        </Link>
        {user.role === "HOST" ? <span className="badge">Hôte</span> : null}
        <form action={logoutAction}>
          <button type="submit" className="btn ghost small">Se déconnecter</button>
        </form>
      </div>
      {ready ? <Nav isHost={user.role === "HOST"} /> : null}
      {unread.length ? <SantaBanner items={unread} /> : null}
      <main>{children}</main>
    </>
  );
}
