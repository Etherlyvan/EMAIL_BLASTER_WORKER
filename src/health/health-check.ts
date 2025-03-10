import express, { Request, Response } from 'express';
import logger from '../config/logger';
import { env } from '../config/environment';
import queueService from '../services/queue.service';
import taskManager from '../processors/task-manager';
import emailService from '../services/email.service';
import apiService from '../services/api.service';

// Create Express app for health checks
const app = express();

// Basic info route
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'email-worker',
    status: 'running',
    version: process.env.npm_package_version ?? '1.0.0',
    uptime: process.uptime(),
  });
});

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check queue connection
    const queueStatus = await queueService.getQueueStatus().catch(() => null);
    
    // Check API connectivity
    const apiConnected = await apiService.checkConnectivity().catch(() => false);
    
    // Get worker stats
    const workerStats = taskManager.getStats();
    const emailStats = emailService.getStats();
    
    // Calculate overall health
    const isHealthy = !!queueStatus && taskManager.isRunning() && apiConnected;
    
    // Construct health response
    const health = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        queue: {
          connected: !!queueStatus,
          messageCount: queueStatus?.messageCount ?? 0,
          consumerCount: queueStatus?.consumerCount ?? 0,
        },
        worker: {
          running: taskManager.isRunning(),
          activeWorkers: workerStats.activeWorkers,
          processed: workerStats.processed,
          errorRate: workerStats.errorRate,
        },
        api: {
          connected: apiConnected,
        },
        email: {
          transporters: emailStats.transporters,
          sent: emailStats.totalSent,
        },
      },
    };
    
    // Return appropriate status code
    res.status(isHealthy ? 200 : 503).json(health);
  } catch (error) {
    logger.error(`Health check error: ${error instanceof Error ? error.message : String(error)}`);
    
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed metrics endpoint (protected)
app.get('/metrics', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  // Simple authorization check
  if (!authHeader || authHeader !== `Bearer ${env.api.secretKey}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  
  const workerStats = taskManager.getStats();
  const emailStats = emailService.getStats();
  
  res.json({
    workerStats,
    emailStats,
    system: {
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
    },
  });
});

// Start health check server
export function startHealthServer(): void {
  if (!env.health.enabled) {
    logger.info('Health check server disabled');
    return;
  }
  
  const port = env.health.port;
  
  // Define callback explicitly
  const callback = () => {
    logger.info(`Health check server running on port ${port}`);
  };
  
  app.listen(port, callback);
}