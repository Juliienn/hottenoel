-- Sélection de profils façon « qui regarde ? » : plus d'identifiant saisi.
-- Migration purement additive : aucune colonne supprimée, aucune donnée
-- perdue. La colonne "login" reste en place (ignorée par l'application).

-- Numéro de portable, pour l'envoi des accès par SMS.
ALTER TABLE "User" ADD COLUMN "phone" TEXT;

-- Réglages modifiables par l'Hôte (modèle de SMS…).
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);
