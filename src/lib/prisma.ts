import { PrismaClient } from "@prisma/client";

// Un seul client par processus : en développement, le rechargement à chaud de
// Next recrée les modules et ouvrirait une nouvelle connexion à chaque fois.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
