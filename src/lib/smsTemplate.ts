// Modèle du SMS d'accès, partagé entre le serveur et l'Espace Hôte (aucune
// dépendance serveur). Variables : {prenom}, {motdepasse}, {lien}.

export const SMS_TEMPLATE_MAX = 600;
export const SMS_MAX = 800;

export const DEFAULT_SMS_TEMPLATE = `Bonjour {prenom} ! Ton profil familial pour le site de Noël est prêt ! 🎄
Pour te connecter : {lien}
- Profil : {prenom}
- Mot de passe : {motdepasse} (tu en choisiras un nouveau à ta première connexion)
À très vite pour Noël ! 🎅`;

export type SmsVars = { prenom: string; lien: string; motdepasse?: string | null };

/** Remplit le modèle. Sans mot de passe (simple rappel), toute ligne qui en
 * contient un est retirée plutôt que d'envoyer « Mot de passe : ». */
export function renderSms(template: string, v: SmsVars): string {
  const lines = template.split("\n").filter((l) => v.motdepasse || !l.includes("{motdepasse}"));
  return lines
    .join("\n")
    .replaceAll("{prenom}", v.prenom)
    .replaceAll("{lien}", v.lien)
    .replaceAll("{motdepasse}", v.motdepasse ?? "")
    .trim();
}
