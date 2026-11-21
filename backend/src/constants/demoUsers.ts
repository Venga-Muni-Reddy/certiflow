import { UserRole, BatchStatus } from '@certiflow/shared';

export const SEED_DATA = {
  districts: {
    hyd: {
      id: '33333333-3333-3333-3333-333333333301',
      name: 'Hyderabad Metro',
      code: 'HYD'
    },
    wgl: {
      id: '33333333-3333-3333-3333-333333333302',
      name: 'Warangal Urban',
      code: 'WGL'
    }
  },
  trainingCentres: {
    nirmaan: {
      id: '22222222-2222-2222-2222-222222222201',
      name: 'Nirmaan Skill Academy',
      code: 'TC-HYD-01',
      districtId: '33333333-3333-3333-3333-333333333301'
    }
  },
  users: {
    anika: {
      id: '11111111-1111-1111-1111-111111111101',
      name: 'Anika',
      email: 'anika@nirmaan.org',
      role: UserRole.TRAINING_CENTRE,
      trainingCentreId: '22222222-2222-2222-2222-222222222201',
      districtId: '33333333-3333-3333-3333-333333333301'
    },
    dev: {
      id: '11111111-1111-1111-1111-111111111102',
      name: 'Dev',
      email: 'dev.officer@pragati.gov.in',
      role: UserRole.DISTRICT_OFFICER,
      districtId: '33333333-3333-3333-3333-333333333301',
      trainingCentreId: undefined
    },
    meera: {
      id: '11111111-1111-1111-1111-111111111103',
      name: 'Meera',
      email: 'meera.officer@pragati.gov.in',
      role: UserRole.DISTRICT_OFFICER,
      districtId: '33333333-3333-3333-3333-333333333301',
      trainingCentreId: undefined
    },
    kabir: {
      id: '11111111-1111-1111-1111-111111111104',
      name: 'Kabir',
      email: 'kabir.officer@pragati.gov.in',
      role: UserRole.DISTRICT_OFFICER,
      districtId: '33333333-3333-3333-3333-333333333301',
      trainingCentreId: undefined
    },
    neha: {
      id: '11111111-1111-1111-1111-111111111105',
      name: 'Neha',
      email: 'neha.quality@pragati.gov.in',
      role: UserRole.QUALITY_TEAM,
      districtId: undefined,
      trainingCentreId: undefined
    },
    farah: {
      id: '11111111-1111-1111-1111-111111111106',
      name: 'Farah',
      email: 'farah.director@pragati.gov.in',
      role: UserRole.STATE_OFFICE,
      districtId: undefined,
      trainingCentreId: undefined
    }
  },
  batches: {
    demo01_draft: {
      id: '44444444-4444-4444-4444-444444444401',
      batchCode: 'BCH-2026-DEMO-01',
      courseName: 'Solar PV Technician Level 4',
      status: BatchStatus.DRAFT,
      candidateCount: 0,
      submissionVersion: 1
    },
    demo02_pending_district_60: {
      id: '44444444-4444-4444-4444-444444444402',
      batchCode: 'BCH-2026-DEMO-02',
      courseName: 'Industrial Electrician Level 4',
      status: BatchStatus.PENDING_DISTRICT,
      candidateCount: 60,
      submissionVersion: 1
    },
    demo03_issued: {
      id: '44444444-4444-4444-4444-444444444403',
      batchCode: 'BCH-2026-DEMO-03',
      courseName: 'CNC Machine Operator Level 3',
      status: BatchStatus.ISSUED,
      candidateCount: 5,
      submissionVersion: 1
    }
  }
};
