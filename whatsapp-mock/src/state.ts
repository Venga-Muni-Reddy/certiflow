import { WhatsAppMessage, ChaosConfig, DeliveryStats } from './types.js';

export class WhatsAppState {
  // Store delivered messages by messageId
  public messages: Map<string, WhatsAppMessage> = new Map();

  // Ledger: maps X-Idempotency-Key -> WhatsAppMessage
  public idempotencyLedger: Map<string, WhatsAppMessage> = new Map();

  // Chaos injection settings
  public chaos: ChaosConfig = {
    failureRate: parseFloat(process.env.WHATSAPP_FAILURE_RATE || '0.3'),
    timeoutRate: parseFloat(process.env.WHATSAPP_TIMEOUT_RATE || '0.1'),
    timeoutDurationMs: 4000
  };

  // Operational statistics
  public stats: DeliveryStats = {
    totalRequests: 0,
    totalDelivered: 0,
    totalFailed: 0,
    totalTimeouts: 0,
    duplicatesBlocked: 0
  };

  public reset(): void {
    this.messages.clear();
    this.idempotencyLedger.clear();
    this.stats = {
      totalRequests: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalTimeouts: 0,
      duplicatesBlocked: 0
    };
  }
}

export const state = new WhatsAppState();
