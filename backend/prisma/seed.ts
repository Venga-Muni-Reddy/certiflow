import { PrismaClient, UserRole, BatchStatus, ApprovalStage, ApprovalDecision } from '@prisma/client';
import crypto from 'crypto';
import { applyDatabaseInvariants } from '../src/db/prisma.js';
import { SEED_DATA } from '../src/constants/demoUsers.js';

export { SEED_DATA };

const prisma = new PrismaClient();

async function main() {
  console.log('[Seed] Starting idempotent database seed...');

  // Automatically ensure custom SQL invariants (sequence, audit trigger, indexes) are applied
  try {
    await applyDatabaseInvariants();
  } catch (err) {
    console.warn('[Seed] Notice: Could not apply custom invariants directly (normal if DB not running or non-Postgres):', err);
  }

  // 1. Seed Districts
  for (const dist of Object.values(SEED_DATA.districts)) {
    await prisma.district.upsert({
      where: { code: dist.code },
      update: { name: dist.name },
      create: dist
    });
  }
  console.log('[Seed] Districts seeded.');

  // 2. Seed Training Centres
  for (const tc of Object.values(SEED_DATA.trainingCentres)) {
    await prisma.trainingCentre.upsert({
      where: { code: tc.code },
      update: { name: tc.name, districtId: tc.districtId },
      create: tc
    });
  }
  console.log('[Seed] Training Centres seeded.');

  // 3. Seed Users
  for (const u of Object.values(SEED_DATA.users)) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role as unknown as UserRole,
        districtId: (u as any).districtId,
        trainingCentreId: (u as any).trainingCentreId
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role as unknown as UserRole,
        districtId: (u as any).districtId,
        trainingCentreId: (u as any).trainingCentreId
      }
    });
  }
  console.log('[Seed] Demo Users (Anika, Dev, Meera, Kabir, Neha, Farah) seeded.');

  // 4. Seed Batch 1 (DRAFT)
  const b1 = SEED_DATA.batches.demo01_draft;
  await prisma.batch.upsert({
    where: { batchCode: b1.batchCode },
    update: {
      status: b1.status,
      candidateCount: b1.candidateCount,
      submissionVersion: b1.submissionVersion
    },
    create: {
      id: b1.id,
      batchCode: b1.batchCode,
      courseName: b1.courseName,
      trainingCentreId: SEED_DATA.trainingCentres.nirmaan.id,
      districtId: SEED_DATA.districts.hyd.id,
      status: b1.status,
      candidateCount: b1.candidateCount,
      submissionVersion: b1.submissionVersion,
      stateEnteredAt: new Date()
    }
  });

  // 5. Seed Batch 2 (PENDING_DISTRICT with 60 candidates & 1 approval from Dev)
  const b2 = SEED_DATA.batches.demo02_pending_district_60;
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);

  const batch2 = await prisma.batch.upsert({
    where: { batchCode: b2.batchCode },
    update: {
      status: b2.status,
      candidateCount: b2.candidateCount,
      submissionVersion: b2.submissionVersion,
      stateEnteredAt: fourHoursAgo
    },
    create: {
      id: b2.id,
      batchCode: b2.batchCode,
      courseName: b2.courseName,
      trainingCentreId: SEED_DATA.trainingCentres.nirmaan.id,
      districtId: SEED_DATA.districts.hyd.id,
      status: b2.status,
      candidateCount: b2.candidateCount,
      submissionVersion: b2.submissionVersion,
      stateEnteredAt: fourHoursAgo
    }
  });

  // Create 60 candidates for Batch 2 if not present
  const existingCandidatesCount = await prisma.batchCandidate.count({
    where: { batchId: batch2.id }
  });

  if (existingCandidatesCount < 60) {
    const candidatesData = [];
    const firstNames = ['Rohan', 'Aarav', 'Pooja', 'Priya', 'Kiran', 'Suresh', 'Deepa', 'Vikram', 'Ananya', 'Rahul'];
    const lastNames = ['Kulkarni', 'Reddy', 'Sharma', 'Patel', 'Rao', 'Verma', 'Goud', 'Nair', 'Mehta', 'Singh'];

    for (let i = 1; i <= 60; i++) {
      const fn = firstNames[(i - 1) % firstNames.length]!;
      const ln = lastNames[(i - 1) % lastNames.length]!;
      const numStr = String(i).padStart(3, '0');
      candidatesData.push({
        batchId: batch2.id,
        rowNumber: i,
        fullName: `${fn} ${ln}`,
        phoneNumber: `+9198765${numStr.padStart(5, '0')}`,
        candidateGovId: `GOV-HYD-2026-${numStr}`,
        assessmentScore: 70 + (i % 25) + 0.5,
        completionDate: new Date('2026-11-15')
      });
    }

    await prisma.batchCandidate.createMany({
      data: candidatesData,
      skipDuplicates: true
    });
    console.log('[Seed] 60 candidates seeded for Batch 2.');
  }

  // Pre-seed Dev's active approval on Batch 2
  await prisma.batchApproval.upsert({
    where: {
      batchId_submissionVersion_stage_actorId: {
        batchId: batch2.id,
        submissionVersion: 1,
        stage: ApprovalStage.DISTRICT,
        actorId: SEED_DATA.users.dev.id
      }
    },
    update: { decision: ApprovalDecision.APPROVE },
    create: {
      batchId: batch2.id,
      submissionVersion: 1,
      stage: ApprovalStage.DISTRICT,
      actorId: SEED_DATA.users.dev.id,
      decision: ApprovalDecision.APPROVE,
      reason: 'All candidate scores verified against district attendance sheets.'
    }
  });
  console.log('[Seed] Batch 2 approval by Dev (1 of 2 required) seeded.');

  // 6. Seed Batch 3 (ISSUED with 5 pre-issued certificates)
  const b3 = SEED_DATA.batches.demo03_issued;
  const batch3 = await prisma.batch.upsert({
    where: { batchCode: b3.batchCode },
    update: {
      status: b3.status,
      candidateCount: b3.candidateCount,
      submissionVersion: b3.submissionVersion
    },
    create: {
      id: b3.id,
      batchCode: b3.batchCode,
      courseName: b3.courseName,
      trainingCentreId: SEED_DATA.trainingCentres.nirmaan.id,
      districtId: SEED_DATA.districts.hyd.id,
      status: b3.status,
      candidateCount: b3.candidateCount,
      submissionVersion: b3.submissionVersion,
      stateEnteredAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
    }
  });

  const sampleCandidates = [
    { name: 'Aarav Reddy', phone: '+919876543210', govId: 'GOV-HYD-1001', score: 88.5 },
    { name: 'Sneha Patel', phone: '+919876543211', govId: 'GOV-HYD-1002', score: 92.0 },
    { name: 'Karthik Rao', phone: '+919876543212', govId: 'GOV-HYD-1003', score: 81.5 },
    { name: 'Divya Nair', phone: '+919876543213', govId: 'GOV-HYD-1004', score: 95.0 },
    { name: 'Manoj Kumar', phone: '+919876543214', govId: 'GOV-HYD-1005', score: 76.5 }
  ];

  for (let i = 0; i < sampleCandidates.length; i++) {
    const sc = sampleCandidates[i]!;
    const seqNum = 100001 + i;
    const certNumber = `PSM-2026-HYD-${seqNum}`;
    const rawToken = `demo_secret_token_candidate_${seqNum}_psm`;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const cand = await prisma.batchCandidate.upsert({
      where: {
        batchId_candidateGovId: {
          batchId: batch3.id,
          candidateGovId: sc.govId
        }
      },
      update: { fullName: sc.name, assessmentScore: sc.score },
      create: {
        batchId: batch3.id,
        rowNumber: i + 1,
        fullName: sc.name,
        phoneNumber: sc.phone,
        candidateGovId: sc.govId,
        assessmentScore: sc.score,
        completionDate: new Date('2026-11-10')
      }
    });

    await prisma.certificate.upsert({
      where: { certificateNumber: certNumber },
      update: {},
      create: {
        certificateNumber: certNumber,
        batchId: batch3.id,
        candidateId: cand.id,
        downloadTokenHash: tokenHash,
        status: 'DELIVERED',
        deliveryAttempts: 1,
        issuedAt: new Date(Date.now() - 20 * 60 * 60 * 1000)
      }
    });
  }
  console.log('[Seed] Batch 3 and 5 sample certificates (PSM-2026-HYD-100001..100005) seeded.');

  console.log('[Seed] Database seeding completed successfully.');
}

if (process.argv[1]?.includes('seed')) {
  main()
    .catch((e) => {
      console.error('[Seed] Error during seeding:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
