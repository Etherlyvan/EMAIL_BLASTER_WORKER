import { setupGlobalErrorHandlers } from './utils/error-handler';
import logger from './config/logger';
import taskManager from './processors/task-manager';
import { startHealthServer } from './health/health-check';
import { env } from './config/environment';
import eventEmitter from './utils/events';

// Set up global error handlers
setupGlobalErrorHandlers();

// Log startup information
logger.info('Starting email worker service');
logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
logger.info(`Node.js version: ${process.version}`);
logger.info(`Worker concurrency: ${env.worker.concurrency}`);

// Start health check server
startHealthServer();

// Set up event listeners
eventEmitter.on('taskManager:started', () => {
  logger.info('Task manager is now processing messages');
});

eventEmitter.on('taskManager:stopped', () => {
  logger.info('Task manager has stopped processing messages');
});

// Start task manager
taskManager.start().catch(error => {
  logger.error(`Failed to start task manager: ${error.message}`);
  process.exit(1);
});

// Log startup completion
logger.info('Email worker service started successfully');