import { execSync } from "node:child_process";

// Lancé par webServer (playwright.config.ts) AVANT le serveur, qui lit la
// base dès la première requête. Base E2E remise à zéro à chaque lancement : migrations appliquées, puis
// toutes les tables vidées.
function prepare() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5433/hotte_e2e";
  if (!/e2e/.test(url)) throw new Error("La base des tests E2E doit contenir « e2e » dans son nom.");
  const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync(`npx prisma db execute --url "${url}" --stdin`, {
    env,
    input: `TRUNCATE "SantaAssignment","SantaExclusion","SantaParticipant","SantaEvent","Claim","WishItem","Session","LoginAttempt","Setting","User" CASCADE;`,
    stdio: ["pipe", "inherit", "inherit"],
  });
}

prepare();
