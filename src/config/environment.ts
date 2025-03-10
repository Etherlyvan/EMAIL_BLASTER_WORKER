//src/config/environment.ts
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

interface Environment {
  rabbitmq: {
    url: string;
    queueName: string;
    deadLetterQueueName: string;
    prefetch: number;
  };
  api: {
    baseUrl: string;
    secretKey: string;
    timeout: number;
  };
  worker: {
    concurrency: number;
    retryLimit: number;
    pollingInterval: number;
    batchSize: number;
  };
  logging: {
    level: string;
    directory: string;
  };
  database: {
    url: string | undefined;
  };
  health: {
    port: number;
    enabled: boolean;
  };
  isDevelopment: boolean;
}

// Validate required environment variables
const requiredEnvVars = ['RABBITMQ_URL', 'API_BASE_URL', 'API_SECRET_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export const env: Environment = {
  rabbitmq: {
    url: process.env.RABBITMQ_URL!,
    queueName: process.env.RABBITMQ_QUEUE_NAME || 'email_tasks',
    deadLetterQueueName: process.env.RABBITMQ_DLQ_NAME || 'email_tasks_dlq',
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH || '5', 10),
  },
  api: {
    baseUrl: process.env.API_BASE_URL!,
    secretKey: process.env.API_SECRET_KEY!,
    timeout: parseInt(process.env.API_TIMEOUT || '30000', 10),
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
    retryLimit: parseInt(process.env.WORKER_RETRY_LIMIT || '3', 10),
    pollingInterval: parseInt(process.env.WORKER_POLLING_INTERVAL || '1000', 10),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || '10', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    directory: process.env.LOG_DIRECTORY || 'logs',
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  health: {
    port: parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10),
    enabled: process.env.ENABLE_HEALTH_CHECK === 'true',
  },
  isDevelopment: process.env.NODE_ENV !== 'production',
};