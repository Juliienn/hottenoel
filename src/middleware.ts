import { NextResponse, type NextRequest } from "next/server";

// Premier filtre, rapide : sans cookie de session, toute page privée renvoie
// vers la connexion. La vraie vérification (session valide, compte actif,
// rôle) est faite en base par requireUser dans chaque page et chaque action.
const PUBLIC = ["/connexion", "/installation"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.has("hotte_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = pathname === "/" ? "" : `?suivant=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/|robots.txt).*)"],
};
