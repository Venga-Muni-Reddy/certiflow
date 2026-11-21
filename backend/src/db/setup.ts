import { execSync } from 'child_process';
import { prisma, applyDatabaseInvariants } from './prisma.js';

/**
 * Automated Database Setup:
 * 1. Generates Prisma Client
 * 2. Deploys database migrations / schema push
 * 3. Automatically executes custom SQL invariants (cert_serial_seq, audit trigger, partial indexes)
 */
export async function runDbSetup(): Promise<void> {
  console.log('[CertiFlow DB Setup] Starting automated database setup...');

  try {
    // 1. Generate Prisma Client
    console.log('[CertiFlow DB Setup] 1/3 Generating Prisma Client types...');
    execSync('npx prisma generate', { stdio: 'inherit' });

    // 2. Synchronize Database Schema (migrate deploy with fallback to db push)
    console.log('[CertiFlow DB Setup] 2/3 Synchronizing database tables...');
    try {
      execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    } catch {
      console.log('[CertiFlow DB Setup] migrate deploy skipped or pending, pushing schema...');
      execSync('npx prisma db push --skip-generate', { stdio: 'inherit' });
    }

    // 3. Automatically execute custom_invariants.sql
    console.log('[CertiFlow DB Setup] 3/3 Applying custom PostgreSQL invariants (sequences, triggers, indexes)...');
    await applyDatabaseInvariants();

    console.log('[CertiFlow DB Setup] Database setup completed successfully!');
  } catch (err) {
    console.error('[CertiFlow DB Setup] Fatal error during database setup:', err);
    throw err;
  }
}

// Auto-run if executed directly as a script
if (process.argv[1]?.includes('setup')) {
  runDbSetup()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
