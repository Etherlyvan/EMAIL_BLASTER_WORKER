import * as amqplib from 'amqplib';
import { Channel, ConsumeMessage } from 'amqplib';
import { env } from '../config/environment';
import logger from '../config/logger';
import { EmailTask, QueueStatus } from '../models/types';

class QueueService {
  // Define connection as any to avoid type conflicts
  private connection: any = null;
  private channel: Channel | null = null;
  private connecting: boolean = false;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 10;
  private readonly reconnectDelay: number = 5000; // 5 seconds

  // Initialize connection to RabbitMQ
  async initialize(): Promise<void> {
    if (this.connecting) return;
    
    this.connecting = true;
    
    try {
      logger.info('Connecting to RabbitMQ...');
      // Connect to RabbitMQ
      this.connection = await amqplib.connect(env.rabbitmq.url);
      
      if (!this.connection) {
        throw new Error('Failed to establish connection to RabbitMQ');
      }
      
      // Handle connection events
      this.connection.on('error', this.handleConnectionError.bind(this));
      this.connection.on('close', this.handleConnectionClosed.bind(this));
      
      // Create channel with proper type handling
      this.channel = await this.connection.createChannel();
      
      if (!this.channel) {
        throw new Error('Failed to create channel');
      }
      
      this.channel.on('error', (err) => logger.error(`Channel error: ${err.message}`));
      this.channel.on('close', () => logger.info('Channel closed'));
      
      // Set prefetch count for consumer
      await this.channel.prefetch(env.rabbitmq.prefetch);
      
      // Declare main queue
      await this.channel.assertQueue(env.rabbitmq.queueName, {
        durable: true,
        maxPriority: 10,
        // Add message TTL if needed
        arguments: {
          'x-message-ttl': 1000 * 60 * 60 * 24, // 24 hours
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': env.rabbitmq.deadLetterQueueName,
        }
      });
      
      // Declare dead letter queue
      await this.channel.assertQueue(env.rabbitmq.deadLetterQueueName, {
        durable: true,
      });
      
      logger.info('Successfully connected to RabbitMQ');
      this.connecting = false;
      this.reconnectAttempts = 0;
    } catch (error) {
      this.connecting = false;
      logger.error(`Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`);
      this.scheduleReconnect();
    }
  }

  // Handle connection errors
  private handleConnectionError(err: Error): void {
    logger.error(`RabbitMQ connection error: ${err.message}`);
    this.scheduleReconnect();
  }

  // Handle connection close events
  private handleConnectionClosed(): void {
    logger.warn('RabbitMQ connection closed');
    this.connection = null;
    this.channel = null;
    this.scheduleReconnect();
  }

  // Schedule reconnection attempt
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectAttempts++;
    
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      logger.error(`Maximum reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      process.exit(1);
      return;
    }
    
    const delay = this.reconnectDelay * Math.min(Math.pow(2, this.reconnectAttempts - 1), 10);
    logger.info(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.initialize().catch(err => {
        logger.error(`Reconnect failed: ${err.message}`);
      });
    }, delay);
  }

  // Publish a message to the queue
  async publishMessage(task: EmailTask): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.initialize();
      }
      
      if (!this.channel) {
        throw new Error('Channel not available');
      }
      
      const taskBuffer = Buffer.from(JSON.stringify(task));
      const result = this.channel.sendToQueue(env.rabbitmq.queueName, taskBuffer, {
        persistent: true,
        priority: task.priority ?? 0,
      });
      
      if (result) {
        logger.debug(`Task queued: ${task.id} for recipient ${task.recipient.email}`);
      } else {
        logger.warn(`Queue buffer full, could not queue task: ${task.id}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // Publish message to dead letter queue
  async publishToDLQ(task: EmailTask, error: string): Promise<boolean> {
    try {
      if (!this.channel) {
        await this.initialize();
      }
      
      if (!this.channel) {
        throw new Error('Channel not available');
      }
      
      // Add error information to task
      const failedTask = {
        ...task,
        error,
        failedAt: new Date().toISOString(),
      };
      
      const taskBuffer = Buffer.from(JSON.stringify(failedTask));
      const result = this.channel.sendToQueue(env.rabbitmq.deadLetterQueueName, taskBuffer, {
        persistent: true,
      });
      
      if (result) {
        logger.debug(`Task sent to DLQ: ${task.id} for recipient ${task.recipient.email}`);
      } else {
        logger.warn(`DLQ buffer full, could not queue failed task: ${task.id}`);
      }
      
      return result;
    } catch (error) {
      logger.error(`Failed to publish to DLQ: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  // Consume messages from the queue
  async consumeMessages(
    handler: (task: EmailTask, message: ConsumeMessage) => Promise<void>
  ): Promise<void> {
    try {
      if (!this.channel) {
        await this.initialize();
      }
      
      if (!this.channel) {
        throw new Error('Channel not available');
      }
      
      await this.channel.consume(env.rabbitmq.queueName, async (message) => {
        if (!message) return;
        
        try {
          const task = JSON.parse(message.content.toString()) as EmailTask;
          await handler(task, message);
        } catch (error) {
          logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
          // Nack the message (don't requeue since it's likely a parsing error)
          if (this.channel) {
            this.channel.nack(message, false, false);
          }
        }
      });
      
      logger.info(`Started consuming messages from queue: ${env.rabbitmq.queueName}`);
    } catch (error) {
      logger.error(`Failed to start consuming messages: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  // Acknowledge a message
  async acknowledgeMessage(message: ConsumeMessage): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    
    this.channel.ack(message);
  }

  // Reject a message
  async rejectMessage(message: ConsumeMessage, requeue: boolean = false): Promise<void> {
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    
    this.channel.nack(message, false, requeue);
  }

  // Get queue status
  async getQueueStatus(): Promise<QueueStatus> {
    if (!this.channel) {
      await this.initialize();
    }
    
    if (!this.channel) {
      throw new Error('Channel not available');
    }
    
    const queueInfo = await this.channel.assertQueue(env.rabbitmq.queueName, {
      durable: true,
      maxPriority: 10,
    });
    
    return {
      queueName: env.rabbitmq.queueName,
      messageCount: queueInfo.messageCount,
      consumerCount: queueInfo.consumerCount,
    };
  }

  // Close connection
  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      
      logger.info('RabbitMQ connection closed');
    } catch (error) {
      logger.error(`Error closing RabbitMQ connection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Create singleton instance
const queueService = new QueueService();

export default queueService;