import logger from '../config/logger';
import queueService from '../services/queue.service';

// Global uncaught exception handler
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
    // In production, we might want to restart the process
    if (process.env.NODE_ENV === 'production') {
      logger.error('Process will exit due to uncaught exception');
      process.exit(1);
    }
  });
  
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', { 
      reason: reason instanceof Error ? reason.stack : String(reason)
    });
  });
  
  // Handle SIGTERM signal
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully');
    gracefulShutdown();
  });
  
  // Handle SIGINT signal (Ctrl+C)
  process.on('SIGINT', () => {
    logger.info('SIGINT received. Shutting down gracefully');
    gracefulShutdown();
  });
}

// Graceful shutdown function
let isShuttingDown = false;
async function gracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  
  logger.info('Graceful shutdown initiated');
  
  // Set a timeout for forced exit
  const forceExitTimeout = setTimeout(() => {
    logger.error('Forced exit due to shutdown timeout');
    process.exit(1);
  }, 30000); // 30 seconds
  
  try {
    // Close queue connection
    logger.info('Closing queue connections...');
    await queueService.close();
    
    // Add any other cleanup tasks here
    
    // Clear the timeout and exit normally
    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error(`Error during shutdown: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Helper function to safely execute async functions with retries
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { 
    retries?: number; 
    delay?: number; 
    backoff?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const { 
    retries = 3, 
    delay = 1000, 
    backoff = true,
    onRetry = () => {} 
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < retries) {
        // Calculate delay with exponential backoff if enabled
        const retryDelay = backoff ? delay * Math.pow(2, attempt - 1) : delay;
        
        // Call onRetry callback
        onRetry(attempt, lastError);
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  throw lastError!;
}