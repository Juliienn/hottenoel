import Link from "next/link";

export default function NotFound() {
  return (
    <div className="box auth-card">
      <h2>Page introuvable</h2>
      <p className="hint">Cette page n&apos;existe pas ou ne t&apos;est pas accessible.</p>
      <p><Link href="/ma-liste" className="btn small">Retour à ma liste</Link></p>
    </div>
  );
}
