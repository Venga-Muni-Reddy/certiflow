export interface WhatsAppMessage {
  id: string;
  idempotencyKey: string;
  to: string;
  candidateName: string;
  certificateNumber: string;
  courseName: string;
  downloadUrl: string;
  deliveredAt: string;
  attempts: number;
}

export interface ChaosConfig {
  failureRate: number; // Probability (0.0 to 1.0) of simulated 500 error
  timeoutRate: number; // Probability (0.0 to 1.0) of simulated timeout delay
  timeoutDurationMs: number; // Duration of timeout delay
}

export interface DeliveryStats {
  totalRequests: number;
  totalDelivered: number;
  totalFailed: number;
  totalTimeouts: number;
  duplicatesBlocked: number;
}
