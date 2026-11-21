import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { UserRole } from '@certiflow/shared';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'certiflow-backend',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/v1/health', (_req, res) => {
  res.json({
    status: 'healthy',
    rolesSupported: Object.values(UserRole),
    version: '1.0.0'
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[CertiFlow Backend] Server listening on port ${PORT}`);
  });
}

export default app;
