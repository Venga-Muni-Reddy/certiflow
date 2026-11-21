import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config/env.js';
import { correlationMiddleware } from './middleware/correlation.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.routes.js';
import { batchRouter } from './routes/batch.routes.js';
import { certificateRouter } from './routes/certificate.routes.js';
import { publicRouter } from './routes/public.routes.js';
import { sseRouter } from './routes/sse.routes.js';
import { startOutboxRelay } from './workers/outboxRelay.js';
import { startSlaCron } from './workers/slaWorker.js';

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());
app.use(correlationMiddleware);

// Base Health Check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'certiflow-backend',
    env: config.nodeEnv,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'healthy',
    version: '1.0.0',
    demoMode: config.demoMode,
    timestamp: new Date().toISOString()
  });
});

// API Routes (publicRouter first so unauthenticated verify/download endpoints bypass auth middleware)
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/batches', batchRouter);
app.use('/api/v1', certificateRouter);
app.use('/api/v1/events', sseRouter);

// Central Error Handler
app.use(errorHandler);

// Start background workers & HTTP server (unless in test environment)
if (process.env.NODE_ENV !== 'test') {
  startOutboxRelay();
  startSlaCron();

  app.listen(config.port, () => {
    console.log(`[CertiFlow Backend] API Server listening on port ${config.port}`);
    console.log(`[CertiFlow Backend] Public verification at http://localhost:${config.port}/api/v1/public/verify/:certNo`);
    console.log(`[CertiFlow Backend] SSE live stream at http://localhost:${config.port}/api/v1/events/stream`);
  });
}

export default app;
