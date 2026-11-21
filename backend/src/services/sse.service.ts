import { Response } from 'express';
import { redisService } from './redis.service.js';
import { AuthenticatedUser } from '../middleware/auth.js';

interface SSEClient {
  id: string;
  res: Response;
  user: AuthenticatedUser;
}

export class SSEService {
  private clients: Map<string, SSEClient> = new Map();
  private readonly CHANNEL = 'certiflow:events';

  constructor() {
    // Subscribe to Redis Pub/Sub so events broadcast across multiple backend containers
    redisService.subscribeEvent(this.CHANNEL, (eventData) => {
      this.broadcastLocal(eventData);
    });

    // Heartbeat every 15 seconds to prevent ALB/proxy connection termination
    setInterval(() => {
      this.clients.forEach((client) => {
        client.res.write(': ping\n\n');
      });
    }, 15000);
  }

  public addClient(clientId: string, res: Response, user: AuthenticatedUser): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const client: SSEClient = { id: clientId, res, user };
    this.clients.set(clientId, client);

    // Initial connection welcome event
    res.write(`event: CONNECTED\ndata: ${JSON.stringify({ message: 'Connected to CertiFlow live event stream', user: user.name })}\n\n`);

    res.on('close', () => {
      this.clients.delete(clientId);
    });
  }

  public async emitEvent(eventType: string, payload: any): Promise<void> {
    const eventObject = {
      type: eventType,
      timestamp: new Date().toISOString(),
      data: payload
    };

    // Publish to Redis so all worker & API instances synchronize
    await redisService.publishEvent(this.CHANNEL, eventObject);
  }

  private broadcastLocal(eventObject: { type: string; timestamp: string; data: any }): void {
    const sseMessage = `event: ${eventObject.type}\ndata: ${JSON.stringify(eventObject.data)}\n\n`;
    this.clients.forEach((client) => {
      try {
        client.res.write(sseMessage);
      } catch {
        this.clients.delete(client.id);
      }
    });
  }
}

export const sseService = new SSEService();
