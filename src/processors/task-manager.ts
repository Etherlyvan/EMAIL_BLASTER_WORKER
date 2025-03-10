import { ConsumeMessage } from 'amqplib';
import { EmailTask, WorkerStats } from '../models/types';
import logger from '../config/logger';
import queueService from '../services/queue.service';
import { processEmailTask } from './email-processor';
import { env } from '../config/environment';
import eventEmitter from '../utils/events';

class TaskManager {
  private running: boolean = false;
  private activeWorkers: number = 0;
  private stats: WorkerStats = {
    processed: 0,
    successful: 0,
    failed: 0,
    retried: 0,
    startTime: new Date(),
    errorRate: 0,
    activeWorkers: 0,
  };
  private statsInterval: NodeJS.Timeout | null = null;

  // Start processing tasks
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('Task manager is already running');
      return;
    }
    
    this.running = true;
    logger.info('Starting task manager');
    
    try {
      // Start stats reporting
      this.startStatsReporting();
      
      // Connect to queue and start consuming messages
      await queueService.initialize();
      
      // Set up consumer
      await queueService.consumeMessages(this.handleMessage.bind(this));
      
      logger.info('Task manager started successfully');
      
      // Emit started event
      eventEmitter.emit('taskManager:started');
    } catch (error) {
      this.running = false;
      logger.error(`Failed to start task manager: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Handle incoming message
  private async handleMessage(task: EmailTask, message: ConsumeMessage): Promise<void> {
    this.activeWorkers++;
    this.stats.activeWorkers = this.activeWorkers;
    
    try {
      // Process the email task
      await processEmailTask(task, message);
      
      // Update stats
      this.stats.processed++;
      this.stats.successful++;
    } catch (error) {
      // Update stats
      this.stats.processed++;
      this.stats.failed++;
      
      // Calculate error rate
      this.stats.errorRate = this.stats.failed / this.stats.processed;
      
      // Log error
      logger.error(`Error processing task: ${error instanceof Error ? error.message : String(error)}`);
      
      // Check if we should reject the message
      if (this.shouldRejectMessage(error)) {
        await queueService.rejectMessage(message, false);
      } else {
        // Otherwise acknowledge to remove from queue
        await queueService.acknowledgeMessage(message);
      }
    } finally {
      this.activeWorkers--;
      this.stats.activeWorkers = this.activeWorkers;
      this.stats.lastProcessedTime = new Date();
    }
  }

  // Determine if message should be rejected based on error
  private shouldRejectMessage(error: unknown): boolean {
    // Reject if it's a connection error or other infrastructure issue
    // Don't reject if it's an email-specific error
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const rejectableErrors = [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'connection error',
      'network error',
      'out of memory',
    ];
    
    return rejectableErrors.some(errText => 
      errorMessage.toLowerCase().includes(errText.toLowerCase())
    );
  }

  // Start periodic stats reporting
  private startStatsReporting(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }
    
    // Report stats every minute
    this.statsInterval = setInterval(() => {
      const uptime = Math.floor((Date.now() - this.stats.startTime.getTime()) / 1000);
      const hourlyRate = this.stats.processed / (uptime / 3600);
      
      logger.info(`Worker stats: ${this.stats.processed} processed, ${this.stats.successful} successful, ${this.stats.failed} failed, ${this.stats.retried} retried, ${this.stats.activeWorkers} active workers, ${hourlyRate.toFixed(2)} emails/hour`);
      
      // Emit stats event
      eventEmitter.emit('taskManager:stats', { ...this.stats });
    }, 60000); // Every minute
  }

  // Stop task manager
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    logger.info('Stopping task manager');
    
    // Stop stats reporting
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    
    // Close queue connection
    await queueService.close();
    
    this.running = false;
    
    // Emit stopped event
    eventEmitter.emit('taskManager:stopped');
    
    logger.info('Task manager stopped');
  }

  // Get current stats
  getStats(): WorkerStats {
    return { ...this.stats };
  }

  // Check if manager is running
  isRunning(): boolean {
    return this.running;
  }
}

// Create singleton instance
const taskManager = new TaskManager();

export default taskManager;