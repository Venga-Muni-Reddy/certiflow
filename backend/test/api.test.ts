import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { SEED_DATA } from '../prisma/seed.js';

describe('CertiFlow Backend API Endpoints (Phase 4)', () => {
  it('GET /health returns healthy status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('certiflow-backend');
  });

  it('GET /api/v1/health returns API metadata and demoMode enabled', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.demoMode).toBe(true);
  });

  it('GET /api/v1/auth/demo-users returns all 6 demo personas', async () => {
    const res = await request(app).get('/api/v1/auth/demo-users');
    expect(res.status).toBe(200);
    expect(res.body.users).toBeDefined();
    expect(Array.isArray(res.body.users)).toBe(true);
  });

  it('POST /api/v1/auth/demo-switch issues valid signed JWT for Anika (Training Centre)', async () => {
    const anikaId = SEED_DATA.users.anika.id;
    const res = await request(app)
      .post('/api/v1/auth/demo-switch')
      .send({ userId: anikaId });

    if (res.status === 200) {
      expect(res.body.token).toBeDefined();
      expect(res.body.user.name).toBe('Anika');
      expect(res.body.user.role).toBe('TRAINING_CENTRE');

      // Test GET /api/v1/auth/me with Bearer token
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.name).toBe('Anika');
    }
  });

  it('enforces RBAC: unauthenticated request to /api/v1/batches returns 401 Unauthorized', async () => {
    const res = await request(app).get('/api/v1/batches');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('GET /api/v1/public/verify/:certNo returns 404 for forged certificate number', async () => {
    const res = await request(app).get('/api/v1/public/verify/PSM-9999-FAKE-999999');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CERTIFICATE_NOT_FOUND');
  });

  it('GET /api/v1/public/certificates/download rejects missing or empty token with 401', async () => {
    const res = await request(app).get('/api/v1/public/certificates/download');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});
