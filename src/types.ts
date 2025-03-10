// Copy the same types from the main project
export interface Recipient {
    id: string;
    email: string;
    name?: string | null;
    metadata?: Record<string, unknown>;
  }
  
  export interface EmailTemplate {
    id: string;
    subject: string;
    htmlContent: string;
    parameters: string[];
  }
  
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
  
  export interface EmailTask {
    id: string;
    campaignId: string;
    recipient: Recipient;
    template: EmailTemplate;
    smtpConfig: SmtpConfig;
    parameters?: Record<string, string>;
    priority?: number;
    retryCount?: number;
    scheduledFor?: string;
  }
  
  export interface TaskResult {
    taskId: string;
    success: boolean;
    error?: string;
    messageId?: string;
    timestamp: string;
  }