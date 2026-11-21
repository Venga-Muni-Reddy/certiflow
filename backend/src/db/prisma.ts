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
 * Reads custom_invariants.sql from prisma directory and executes raw DDL
 */
export async function applyDatabaseInvariants(): Promise<void> {
  const possiblePaths = [
    path.resolve(__dirname, '../../prisma/custom_invariants.sql'),
    path.resolve(__dirname, '../prisma/custom_invariants.sql'),
    path.resolve(__dirname, '../../../prisma/custom_invariants.sql'),
    path.resolve(process.cwd(), 'prisma/custom_invariants.sql'),
    path.resolve(process.cwd(), 'backend/prisma/custom_invariants.sql')
  ];

  const sqlPath = possiblePaths.find((p) => fs.existsSync(p));
  if (!sqlPath) {
    console.warn('[CertiFlow DB] Warning: custom_invariants.sql not found in search paths.');
    return;
  }

  try {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await prisma.$executeRawUnsafe(sql);
    console.log(`[CertiFlow DB] Custom invariants (sequence, triggers, partial indexes) applied from ${sqlPath}.`);
  } catch (err) {
    console.error('[CertiFlow DB] Error applying custom invariants:', err);
    throw err;
  }
}

export default prisma;
