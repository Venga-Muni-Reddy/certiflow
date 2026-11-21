import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'certiflow-demo-secret-key-super-secure-change-in-production-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  demoMode: process.env.DEMO_MODE !== 'false',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/certiflow?schema=public',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  whatsappServiceUrl: process.env.WHATSAPP_SERVICE_URL || 'http://localhost:4001',
  slaThresholdSeconds: parseInt(process.env.SLA_THRESHOLD_SECONDS || '30', 10),
  slaCheckIntervalSeconds: parseInt(process.env.SLA_CHECK_INTERVAL_SECONDS || '15', 10),
  storageDriver: (process.env.STORAGE_DRIVER || 'local') as 'local' | 's3',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR || './certificates_storage',
  s3: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.S3_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.S3_SECRET_KEY || 'minioadmin',
    bucket: process.env.S3_BUCKET || 'certiflow-certs',
    region: process.env.S3_REGION || 'us-east-1'
  }
};
