import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { state } from '../src/state.js';

describe('Stand-In WhatsApp Mock Service (Moment #3)', () => {
  beforeEach(() => {
    state.reset();
    // Disable chaos for deterministic happy path testing
    state.chaos.failureRate = 0;
    state.chaos.timeoutRate = 0;
  });

  it('rejects message delivery when X-Idempotency-Key header is missing', async () => {
    const res = await request(app)
      .post('/api/messages')
      .send({
        to: '+919876543210',
        candidateName: 'Aarav Reddy',
        certificateNumber: 'PSM-2026-HYD-100001',
        downloadUrl: 'http://localhost:4000/api/v1/public/certificates/download?token=abc'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('delivers WhatsApp message successfully and returns 200 with delivery receipt', async () => {
    const res = await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'cert-id-001')
      .send({
        to: '+919876543210',
        candidateName: 'Aarav Reddy',
        certificateNumber: 'PSM-2026-HYD-100001',
        courseName: 'Solar PV Technician',
        downloadUrl: 'http://localhost:4000/api/v1/public/certificates/download?token=abc'
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('DELIVERED');
    expect(res.body.duplicate).toBe(false);
    expect(res.body.messageId).toBeDefined();
    expect(res.body.certificateNumber).toBe('PSM-2026-HYD-100001');

    expect(state.messages.size).toBe(1);
    expect(state.stats.totalDelivered).toBe(1);
  });

  it('enforces idempotency: retried delivery with same X-Idempotency-Key returns cached receipt without duplicates', async () => {
    const payload = {
      to: '+919876543210',
      candidateName: 'Aarav Reddy',
      certificateNumber: 'PSM-2026-HYD-100001',
      courseName: 'Solar PV Technician',
      downloadUrl: 'http://localhost:4000/api/v1/public/certificates/download?token=abc'
    };

    // First attempt
    const firstRes = await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'cert-id-unique-123')
      .send(payload);

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.duplicate).toBe(false);
    const originalMessageId = firstRes.body.messageId;

    // Retry attempt (e.g. BullMQ worker replay after worker restart)
    const retryRes = await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'cert-id-unique-123')
      .send(payload);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.status).toBe('DELIVERED');
    expect(retryRes.body.duplicate).toBe(true);
    expect(retryRes.body.messageId).toBe(originalMessageId);

    // Exactly 1 message stored
    expect(state.messages.size).toBe(1);
    expect(state.stats.duplicatesBlocked).toBe(1);
  });

  it('simulates transient 500 error when failure chaos is triggered without recording in ledger', async () => {
    state.chaos.failureRate = 1.0; // Force 100% failure

    const res = await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'cert-id-flaky-fail')
      .send({
        to: '+919876543210',
        candidateName: 'Aarav Reddy',
        certificateNumber: 'PSM-2026-HYD-100001',
        downloadUrl: 'http://localhost:4000/api/v1/public/certificates/download?token=abc'
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('SIMULATED_PROVIDER_500');

    // Message must NOT be stored so subsequent BullMQ retry can succeed
    expect(state.messages.size).toBe(0);
    expect(state.idempotencyLedger.has('cert-id-flaky-fail')).toBe(false);
    expect(state.stats.totalFailed).toBe(1);
  });

  it('updates chaos simulation parameters dynamically via /api/chaos', async () => {
    const updateRes = await request(app)
      .post('/api/chaos')
      .send({ failureRate: 0.45, timeoutRate: 0.15 });

    expect(updateRes.status).toBe(200);
    expect(state.chaos.failureRate).toBe(0.45);
    expect(state.chaos.timeoutRate).toBe(0.15);

    const getRes = await request(app).get('/api/chaos');
    expect(getRes.status).toBe(200);
    expect(getRes.body.chaos.failureRate).toBe(0.45);
  });

  it('renders the reviewer phone inbox HTML view at /inbox', async () => {
    // Deliver 1 message
    await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'inbox-test-cert')
      .send({
        to: '+919876543210',
        candidateName: 'Priya Sharma',
        certificateNumber: 'PSM-2026-HYD-100099',
        courseName: 'Industrial Electrician',
        downloadUrl: 'http://localhost:4000/api/v1/public/certificates/download?token=test-download'
      });

    const res = await request(app).get('/inbox');
    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('text/html');
    expect(res.text).toContain('Priya Sharma');
    expect(res.text).toContain('PSM-2026-HYD-100099');
    expect(res.text).toContain('test-download');
  });

  it('resets inbox and idempotency ledger on POST /api/reset', async () => {
    await request(app)
      .post('/api/messages')
      .set('X-Idempotency-Key', 'reset-test-cert')
      .send({
        to: '+919876543210',
        candidateName: 'Priya Sharma',
        certificateNumber: 'PSM-2026-HYD-100099',
        downloadUrl: 'http://localhost:4000/download'
      });

    expect(state.messages.size).toBe(1);

    const resetRes = await request(app).post('/api/reset');
    expect(resetRes.status).toBe(200);
    expect(state.messages.size).toBe(0);
    expect(state.idempotencyLedger.size).toBe(0);
    expect(state.stats.totalDelivered).toBe(0);
  });
});
