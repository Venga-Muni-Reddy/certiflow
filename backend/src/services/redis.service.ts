import { Redis } from 'ioredis';
import EventEmitter from 'events';
import { config } from '../config/env.js';

class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private memoryFallbackEmitter = new EventEmitter();
  private memoryCache = new Map<string, { value: string; expiresAt: number }>();
  public isConnected = false;

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => {
          if (times > 3) {
            // Stop logging spam if Redis is absent in bare-metal mode
            return null;
          }
          return Math.min(times * 200, 1000);
        }
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log('[Redis] Connected to Redis cluster successfully.');
      });

      this.client.on('error', (_err) => {
        this.isConnected = false;
        // Keep running in fallback mode without crashing server
      });

      this.subscriber = this.client.duplicate();
    } catch (_err) {
      this.isConnected = false;
      console.warn('[Redis] Warning: Redis unavailable. Running in memory-event fallback mode.');
    }
  }

  public getClient(): Redis | null {
    return this.isConnected ? this.client : null;
  }

  // Verification Cache operations
  public async getVerificationCache(certificateNumber: string): Promise<string | null> {
    const key = `cert:verify:${certificateNumber}`;
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // Fall back to memory cache
      }
    }
    const item = this.memoryCache.get(key);
    if (item && item.expiresAt > Date.now()) {
      return item.value;
    }
    return null;
  }

  public async setVerificationCache(certificateNumber: string, payloadStr: string, ttlSeconds = 3600): Promise<void> {
    const key = `cert:verify:${certificateNumber}`;
    if (this.isConnected && this.client) {
      try {
        await this.client.set(key, payloadStr, 'EX', ttlSeconds);
        return;
      } catch {
        // Fall back to memory cache
      }
    }
    this.memoryCache.set(key, { value: payloadStr, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  public async invalidateVerificationCache(certificateNumber: string): Promise<void> {
    const key = `cert:verify:${certificateNumber}`;
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
      } catch {
        // Continue
      }
    }
    this.memoryCache.delete(key);
  }

  // Pub/Sub operations
  public async publishEvent(channel: string, eventData: any): Promise<void> {
    const message = JSON.stringify(eventData);
    if (this.isConnected && this.client) {
      try {
        await this.client.publish(channel, message);
      } catch {
        // Emit to local fallback
      }
    }
    this.memoryFallbackEmitter.emit(channel, eventData);
  }

  public subscribeEvent(channel: string, callback: (eventData: any) => void): void {
    if (this.isConnected && this.subscriber) {
      try {
        this.subscriber.subscribe(channel);
        this.subscriber.on('message', (chan, msg) => {
          if (chan === channel) {
            try {
              callback(JSON.parse(msg));
            } catch {
              callback(msg);
            }
          }
        });
      } catch {
        // Fall back to memory emitter
      }
    }
    this.memoryFallbackEmitter.on(channel, callback);
  }
}

export const redisService = new RedisService();
