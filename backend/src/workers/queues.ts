import { Queue } from 'bullmq';
import { redisService } from '../services/redis.service.js';

export const QUEUE_NAMES = {
  PDF_GENERATE: 'certificate-generate',
  WHATSAPP_DELIVER: 'whatsapp-deliver',
  SLA_MONITOR: 'sla-monitor'
};

const redisClient = redisService.getClient();

// BullMQ Queue singletons (or null in offline mode)
export const pdfQueue = redisClient
  ? new Queue(QUEUE_NAMES.PDF_GENERATE, { connection: redisClient as any })
  : null;

export const whatsappQueue = redisClient
  ? new Queue(QUEUE_NAMES.WHATSAPP_DELIVER, { connection: redisClient as any })
  : null;

export const slaQueue = redisClient
  ? new Queue(QUEUE_NAMES.SLA_MONITOR, { connection: redisClient as any })
  : null;
