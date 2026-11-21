import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Apply custom PostgreSQL invariants (monotonic sequence, triggers, partial indexes)
 */
export async function applyDatabaseInvariants(): Promise<void> {
  const sqlPath = path.resolve(__dirname, '../../prisma/custom_invariants.sql');
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await prisma.$executeRawUnsafe(sql);
    console.log('[CertiFlow DB] Custom invariants applied successfully.');
  }
}

export default prisma;
