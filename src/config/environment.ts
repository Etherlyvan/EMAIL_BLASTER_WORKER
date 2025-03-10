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

// Define default values for non-critical variables
const defaultValues = {
  rabbitmq: {
    queueName: 'email_tasks',
    deadLetterQueueName: 'email_tasks_dlq',
    prefetch: 5,
  },
  worker: {
    concurrency: 5,
    retryLimit: 3,
    pollingInterval: 1000,
    batchSize: 10,
  },
  api: {
    timeout: 30000,
  },
  logging: {
    level: 'info',
    directory: 'logs',
  },
  health: {
    port: 3000,
    enabled: true,
  },
};

// Validate required environment variables
const requiredEnvVars = ['RABBITMQ_URL', 'API_BASE_URL', 'API_SECRET_KEY'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  const message = `Missing required environment variables: ${missingEnvVars.join(', ')}`;
  
  if (process.env.NODE_ENV === 'production') {
    throw new Error(message);
  } else {
    console.warn(`WARNING: ${message}`);
    console.warn('Application may not function correctly without these variables.');
    // Set placeholder values for development
    if (!process.env.RABBITMQ_URL) process.env.RABBITMQ_URL = 'amqp://guest:guest@localhost:5672';
    if (!process.env.API_BASE_URL) process.env.API_BASE_URL = 'http://localhost:3000';
    if (!process.env.API_SECRET_KEY) process.env.API_SECRET_KEY = 'dev-secret-key';
  }
}

export const env: Environment = {
  rabbitmq: {
    url: process.env.RABBITMQ_URL!,
    queueName: process.env.RABBITMQ_QUEUE_NAME || defaultValues.rabbitmq.queueName,
    deadLetterQueueName: process.env.RABBITMQ_DLQ_NAME || defaultValues.rabbitmq.deadLetterQueueName,
    prefetch: parseInt(process.env.RABBITMQ_PREFETCH || String(defaultValues.rabbitmq.prefetch), 10),
  },
  api: {
    baseUrl: process.env.API_BASE_URL!,
    secretKey: process.env.API_SECRET_KEY!,
    timeout: parseInt(process.env.API_TIMEOUT || String(defaultValues.api.timeout), 10),
  },
  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || String(defaultValues.worker.concurrency), 10),
    retryLimit: parseInt(process.env.WORKER_RETRY_LIMIT || String(defaultValues.worker.retryLimit), 10),
    pollingInterval: parseInt(process.env.WORKER_POLLING_INTERVAL || String(defaultValues.worker.pollingInterval), 10),
    batchSize: parseInt(process.env.WORKER_BATCH_SIZE || String(defaultValues.worker.batchSize), 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || defaultValues.logging.level,
    directory: process.env.LOG_DIRECTORY || defaultValues.logging.directory,
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  health: {
    port: parseInt(process.env.HEALTH_CHECK_PORT || String(defaultValues.health.port), 10),
    enabled: process.env.ENABLE_HEALTH_CHECK === 'true' || defaultValues.health.enabled,
  },
  isDevelopment: process.env.NODE_ENV !== 'production',
};