export class OutboxService {
  /**
   * Atomically enqueues an outbox event in the same transaction
   */
  public async enqueueEvent(
    tx: any,
    aggregateType: 'BATCH' | 'CERTIFICATE',
    aggregateId: string,
    eventType: string,
    payload: Record<string, any>,
    correlationId: string
  ): Promise<void> {
    await tx.outboxEvent.create({
      data: {
        aggregateType,
        aggregateId,
        eventType,
        payload,
        correlationId
      }
    });
  }
}

export const outboxService = new OutboxService();
