import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { state } from '../state.js';
import { WhatsAppMessage } from '../types.js';

export const messagesRouter = Router();

/**
 * POST /api/messages
 * Delivers a candidate WhatsApp notification with idempotency guarantees & chaos simulation
 */
messagesRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  const idempotencyKey = (req.header('X-Idempotency-Key') || req.body.idempotencyKey || '').trim();
  const { to, candidateName, certificateNumber, courseName, downloadUrl } = req.body;

  state.stats.totalRequests++;

  // 1. Validation
  if (!idempotencyKey) {
    res.status(400).json({
      error: 'MISSING_IDEMPOTENCY_KEY',
      message: 'Header X-Idempotency-Key is strictly required for WhatsApp delivery.'
    });
    return;
  }

  if (!to || !candidateName || !certificateNumber || !downloadUrl) {
    res.status(400).json({
      error: 'MISSING_FIELDS',
      message: 'to, candidateName, certificateNumber, and downloadUrl are mandatory.'
    });
    return;
  }

  // 2. Check Idempotency Ledger (Moment #3: Never deliver duplicate certificates)
  if (state.idempotencyLedger.has(idempotencyKey)) {
    const existing = state.idempotencyLedger.get(idempotencyKey)!;
    state.stats.duplicatesBlocked++;
    res.status(200).json({
      status: 'DELIVERED',
      duplicate: true,
      message: 'Message was previously delivered with this idempotency key. Returned cached receipt.',
      messageId: existing.id,
      deliveredAt: existing.deliveredAt,
      certificateNumber: existing.certificateNumber
    });
    return;
  }

  // 3. Chaos: Timeout Simulation
  if (Math.random() < state.chaos.timeoutRate) {
    state.stats.totalTimeouts++;
    // Simulate delayed gateway timeout
    await new Promise((resolve) => setTimeout(resolve, Math.min(state.chaos.timeoutDurationMs, 2500)));
    res.status(504).json({
      error: 'SIMULATED_GATEWAY_TIMEOUT',
      message: 'WhatsApp BSP upstream timed out. BullMQ worker must retry with exponential backoff.'
    });
    return;
  }

  // 4. Chaos: Transient Server Failure (HTTP 500)
  if (Math.random() < state.chaos.failureRate) {
    state.stats.totalFailed++;
    res.status(500).json({
      error: 'SIMULATED_PROVIDER_500',
      message: 'WhatsApp Meta Graph API returned 500 Service Unavailable. BullMQ worker must retry.'
    });
    return;
  }

  // 5. Successful Delivery
  const message: WhatsAppMessage = {
    id: uuidv4(),
    idempotencyKey,
    to,
    candidateName,
    certificateNumber,
    courseName: courseName || 'Skills Mission Certification',
    downloadUrl,
    deliveredAt: new Date().toISOString(),
    attempts: 1
  };

  state.messages.set(message.id, message);
  state.idempotencyLedger.set(idempotencyKey, message);
  state.stats.totalDelivered++;

  res.status(200).json({
    status: 'DELIVERED',
    duplicate: false,
    messageId: message.id,
    deliveredAt: message.deliveredAt,
    certificateNumber: message.certificateNumber
  });
});

/**
 * GET /api/messages
 * Returns list of delivered WhatsApp messages with optional filters
 */
messagesRouter.get('/', (req: Request, res: Response) => {
  const { to, certificateNumber } = req.query;
  let list = Array.from(state.messages.values());

  if (to && typeof to === 'string') {
    list = list.filter((m) => m.to.includes(to));
  }
  if (certificateNumber && typeof certificateNumber === 'string') {
    list = list.filter((m) => m.certificateNumber.toLowerCase().includes(certificateNumber.toLowerCase()));
  }

  // Sort descending by delivery time
  list.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());

  res.json({
    count: list.length,
    messages: list
  });
});
