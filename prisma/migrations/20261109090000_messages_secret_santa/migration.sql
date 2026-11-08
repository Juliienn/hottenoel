-- Messages de l'Hôte aux participants d'un Secret Santa (annonce, tirage).
-- Migration purement additive : aucune donnée existante modifiée.

-- CreateEnum
CREATE TYPE "SantaMessageKind" AS ENUM ('ANNONCE', 'TIRAGE');

-- CreateTable
CREATE TABLE "SantaMessage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "SantaMessageKind" NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SantaMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SantaMessageSeen" (
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SantaMessageSeen_pkey" PRIMARY KEY ("messageId","userId")
);

-- CreateIndex
CREATE INDEX "SantaMessage_eventId_idx" ON "SantaMessage"("eventId");

-- CreateIndex
CREATE INDEX "SantaMessageSeen_userId_idx" ON "SantaMessageSeen"("userId");

-- AddForeignKey
ALTER TABLE "SantaMessage" ADD CONSTRAINT "SantaMessage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "SantaEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SantaMessageSeen" ADD CONSTRAINT "SantaMessageSeen_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SantaMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SantaMessageSeen" ADD CONSTRAINT "SantaMessageSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

