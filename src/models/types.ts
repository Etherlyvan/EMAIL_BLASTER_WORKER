// Recipient information
export interface Recipient {
    id: string;
    email: string;
    name?: string | null;
    metadata?: Record<string, unknown>;
  }
  
  // Email template information
  export interface EmailTemplate {
    id: string;
    subject: string;
    htmlContent: string;
    parameters: string[];
  }
  
  // SMTP configuration
  export interface SmtpConfig {
    id: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromEmail: string;
    fromName: string;
  }
  
  // Email task definition
  export interface EmailTask {
    id: string;
    campaignId: string;
    recipient: Recipient;
    template: EmailTemplate;
    smtpConfig: SmtpConfig;
    parameters?: Record<string, string>;
    priority?: number; // 0-10, higher = more priority
    retryCount: number;
    scheduledFor?: string; // ISO date string
    trackingEnabled: boolean;
  }
  
  // Task processing result
  export interface TaskResult {
    taskId: string;
    campaignId: string;
    recipientId: string;
    success: boolean;
    error?: string;
    messageId?: string;
    timestamp: string;
    retryCount: number;
    retryable: boolean;
  }
  
  // Status update payload
  export interface StatusUpdatePayload {
    campaignId: string;
    recipientId: string;
    status: 'sent' | 'failed' | 'processed';
    error?: string;
    messageId?: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }
  
  // Worker statistics
  export interface WorkerStats {
    processed: number;
    successful: number;
    failed: number;
    retried: number;
    startTime: Date;
    lastProcessedTime?: Date;
    errorRate: number;
    activeWorkers: number;
  }
  
  // Queue status
  export interface QueueStatus {
    queueName: string;
    messageCount: number;
    consumerCount: number;
  }