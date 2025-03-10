import { ConsumeMessage } from 'amqplib';
import { EmailTask, TaskResult } from '../models/types';
import logger from '../config/logger';
import queueService from '../services/queue.service';
import emailService from '../services/email.service';
import apiService from '../services/api.service';
import { withRetry } from '../utils/error-handler';
import { env } from '../config/environment';

// Process a single email task
export async function processEmailTask(
  task: EmailTask, 
  message: ConsumeMessage
): Promise<void> {
  // Check if task is scheduled for the future
  if (task.scheduledFor) {
    const scheduledTime = new Date(task.scheduledFor);
    const now = new Date();
    
    if (scheduledTime > now) {
      // Requeue with a delay if possible
      const delayMs = Math.min(scheduledTime.getTime() - now.getTime(), 60 * 60 * 1000); // Max 1 hour delay
      
      // Acknowledge the current message
      await queueService.acknowledgeMessage(message);
      
      // Re-publish with a delay
      setTimeout(() => {
        queueService.publishMessage(task).catch(err => {
          logger.error(`Failed to requeue scheduled task: ${err.message}`);
        });
      }, delayMs);
      
      logger.info(`Task ${task.id} rescheduled for ${scheduledTime.toISOString()}`);
      return;
    }
  }
  
  try {
    // Send the email
    const result = await emailService.sendEmail(task);
    
    // Update status via API
    const statusUpdateSuccessful = await withRetry(
      () => apiService.updateEmailStatus({
        campaignId: task.campaignId,
        recipientId: task.recipient.id,
        status: result.success ? 'sent' : 'failed',
        error: result.error,
        messageId: result.messageId,
        timestamp: result.timestamp,
      }),
      {
        retries: 3,
        delay: 1000,
        backoff: true,
        onRetry: (attempt, error) => {
          logger.warn(`Retry ${attempt} updating status for task ${task.id}: ${error.message}`);
        }
      }
    );
    
    if (!statusUpdateSuccessful) {
      logger.error(`Failed to update status for task ${task.id} after retries`);
    }
    
    // Handle failed email
    if (!result.success) {
      // Check if we should retry
      if (result.retryable && task.retryCount < env.worker.retryLimit) {
        // Create a new task with incremented retry count
        const retryTask: EmailTask = {
          ...task,
          retryCount: task.retryCount + 1,
        };
        
        // Calculate delay using exponential backoff
        const delay = Math.pow(2, retryTask.retryCount) * 1000;
        
        // Acknowledge the current message
        await queueService.acknowledgeMessage(message);
        
        // Requeue with a delay
        setTimeout(() => {
          queueService.publishMessage(retryTask).catch(err => {
            logger.error(`Failed to requeue task for retry: ${err.message}`);
          });
        }, delay);
        
        logger.info(`Task ${task.id} scheduled for retry ${retryTask.retryCount}/${env.worker.retryLimit} after ${delay}ms`);
        return;
      } else {
        // Max retries reached or non-retryable error
        logger.error(`Task ${task.id} failed: ${result.error}`);
        
        // Send to dead letter queue for manual inspection
        await queueService.publishToDLQ(task, result.error || 'Unknown error');
      }
    }
    
    // Acknowledge the message
    await queueService.acknowledgeMessage(message);
    
    logger.info(`Task ${task.id} processed successfully (${result.success ? 'sent' : 'failed'})`);
  } catch (error) {
    logger.error(`Unexpected error processing task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
    
    // Reject and requeue the message if it's a system error rather than an email sending error
    await queueService.rejectMessage(message, true);
  }
}