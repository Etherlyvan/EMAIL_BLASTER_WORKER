import nodemailer, { Transporter } from 'nodemailer';
import { EmailTask, TaskResult } from '../models/types';
import logger from '../config/logger';
import { processTemplate } from '../utils/template-processor';

class EmailService {
  private transporters: Map<string, { 
    transporter: Transporter; 
    lastUsed: Date;
    usageCount: number;
  }> = new Map();

  // Get or create a transporter for a specific SMTP config
  private async getTransporter(smtpConfig: EmailTask['smtpConfig']): Promise<Transporter> {
    const key = `${smtpConfig.host}:${smtpConfig.port}:${smtpConfig.username}`;
    
    // Check if we already have a transporter for this config
    if (this.transporters.has(key)) {
      const transporterInfo = this.transporters.get(key)!;
      
      // Update last used timestamp
      transporterInfo.lastUsed = new Date();
      transporterInfo.usageCount++;
      
      // Return existing transporter
      return transporterInfo.transporter;
    }
    
    // Create new transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      },
      // Add pooling options for better performance
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Set reasonable timeouts
      connectionTimeout: 10000, // 10 seconds
      socketTimeout: 30000, // 30 seconds
    });
    
    // Verify connection
    try {
      await transporter.verify();
      logger.info(`SMTP connection verified for ${smtpConfig.host}`);
    } catch (error) {
      logger.error(`Failed to verify SMTP connection for ${smtpConfig.host}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    
    // Store transporter in cache
    this.transporters.set(key, { 
      transporter, 
      lastUsed: new Date(),
      usageCount: 1
    });
    
    // Clean up old transporters periodically
    this.cleanupTransporters();
    
    return transporter;
  }

  // Clean up old transporters to prevent memory leaks
  private cleanupTransporters(): void {
    const now = new Date();
    const MAX_IDLE_TIME = 10 * 60 * 1000; // 10 minutes
    
    for (const [key, info] of this.transporters.entries()) {
      const idleTime = now.getTime() - info.lastUsed.getTime();
      
      if (idleTime > MAX_IDLE_TIME) {
        logger.debug(`Removing idle transporter for ${key}`);
        info.transporter.close();
        this.transporters.delete(key);
      }
    }
  }

  // Send an email
  async sendEmail(task: EmailTask): Promise<TaskResult> {
    const startTime = Date.now();
    
    try {
      // Get transporter
      const transporter = await this.getTransporter(task.smtpConfig);
      
      // Process email content
      const { subject, html } = processTemplate(
        task.template,
        task.recipient,
        task.parameters
      );
      
      // Add tracking pixel if enabled
      let finalHtml = html;
      if (task.trackingEnabled) {
        finalHtml = this.addTrackingPixel(
          html,
          task.campaignId,
          task.recipient.id
        );
      }
      
      // Send email
      const info = await transporter.sendMail({
        from: `"${task.smtpConfig.fromName}" <${task.smtpConfig.fromEmail}>`,
        to: task.recipient.email,
        subject,
        html: finalHtml,
        // Add headers for better deliverability
        headers: {
          'X-Campaign-ID': task.campaignId,
          'X-Recipient-ID': task.recipient.id,
        },
      });
      
      const processingTime = Date.now() - startTime;
      logger.info(`Email sent to ${task.recipient.email} in ${processingTime}ms (Message ID: ${info.messageId})`);
      
      return {
        taskId: task.id,
        campaignId: task.campaignId,
        recipientId: task.recipient.id,
        success: true,
        messageId: info.messageId,
        timestamp: new Date().toISOString(),
        retryCount: task.retryCount,
        retryable: false,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      logger.error(`Failed to send email to ${task.recipient.email} after ${processingTime}ms: ${errorMessage}`);
      
      // Determine if error is retryable
      const isRetryable = this.isRetryableError(errorMessage);
      
      return {
        taskId: task.id,
        campaignId: task.campaignId,
        recipientId: task.recipient.id,
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
        retryCount: task.retryCount,
        retryable: isRetryable,
      };
    }
  }

  // Add tracking pixel to email
  private addTrackingPixel(html: string, campaignId: string, recipientId: string): string {
    const trackingUrl = `${process.env.API_BASE_URL}/api/track/open?c=${campaignId}&r=${recipientId}&t=${Date.now()}`;
    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" alt="" style="display:none;" />`;
    
    // Add before closing body tag if exists
    if (html.includes('</body>')) {
      return html.replace('</body>', `${trackingPixel}</body>`);
    }
    
    // Otherwise append to the end
    return html + trackingPixel;
  }

  // Check if error is retryable
  private isRetryableError(errorMessage: string): boolean {
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ESOCKET',
      'EENVELOPE',
      'connection closed',
      'connection error',
      'timed out',
      'greylisted',
      'please try again',
      'temporary failure',
      'timeout',
      'rate limit',
      'too many',
      '421',
      '450',
      '451',
      '452',
      '454',
      '455',
    ];
    
    return retryableErrors.some(errText => 
      errorMessage.toLowerCase().includes(errText.toLowerCase())
    );
  }

  // Get service stats
  getStats(): { transporters: number; totalSent: number } {
    const totalSent = Array.from(this.transporters.values())
      .reduce((sum, info) => sum + info.usageCount, 0);
    
    return {
      transporters: this.transporters.size,
      totalSent,
    };
  }
}

// Create singleton instance
const emailService = new EmailService();

export default emailService;