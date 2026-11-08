import { requireUser } from "@/lib/auth/next";
import { myItems } from "@/lib/services/wishlist";
import { MyList } from "./MyList";

export const metadata = { title: "Ma liste" };

export default async function MyListPage() {
  const user = await requireUser();
  const items = await myItems(user);
  return (
    <div className="panel">
      <p className="notice">Ici tu ne vois jamais ce qui est déjà réservé sur ta liste, ni par qui. Ajoute des idées à tous les prix : ça laisse le choix à chacun.</p>
      <MyList items={items} />
    </div>
  );
}
