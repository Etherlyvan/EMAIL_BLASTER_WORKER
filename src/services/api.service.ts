import { StatusUpdatePayload } from '../models/types';
import { env } from '../config/environment';
import logger from '../config/logger';

class ApiService {
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly timeout: number;
  
  constructor() {
    this.baseUrl = env.api.baseUrl;
    this.secretKey = env.api.secretKey;
    this.timeout = env.api.timeout;
  }
  
  // Update status of an email
  async updateEmailStatus(payload: StatusUpdatePayload): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/api/webhook/email-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.secretKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API responded with status ${response.status}: ${text}`);
      }
      
      logger.debug(`Status updated for email to campaign ${payload.campaignId}, recipient ${payload.recipientId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to update email status: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  // Check API connectivity
  async checkConnectivity(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.baseUrl}/api/health`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      return response.ok;
    } catch (error) {
      logger.error(`API connectivity check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }
  
  // Get campaign status
  async getCampaignStatus(campaignId: string): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/api/webhook/campaign-status/${campaignId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.secretKey}`,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error(`Failed to get campaign status: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService;