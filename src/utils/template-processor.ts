import { EmailTask } from '../models/types';
import logger from '../config/logger';

interface ProcessedContent {
  subject: string;
  html: string;
}

// Process email template with recipient data and parameters
export function processTemplate(
  template: EmailTask['template'],
  recipient: EmailTask['recipient'],
  parameters?: Record<string, string>
): ProcessedContent {
  try {
    // Start with the original content
    let subject = template.subject;
    let html = template.htmlContent;
    
    // Create parameters object from recipient data
    const defaultParams: Record<string, string> = {
      email: recipient.email,
      name: recipient.name || recipient.email,
    };
    
    // Add metadata fields
    if (recipient.metadata) {
      Object.entries(recipient.metadata).forEach(([key, value]) => {
        // Skip undefined or null values
        if (value === undefined || value === null) return;
        
        // Convert to string
        defaultParams[key] = String(value);
      });
    }
    
    // Merge with provided parameters
    const allParams = {
      ...defaultParams,
      ...(parameters || {}),
    };
    
    // Replace parameters in subject and content
    // Format: {{parameter}}
    Object.entries(allParams).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      subject = subject.replace(regex, value);
      html = html.replace(regex, value);
    });
    
    // Check for any remaining unprocessed parameters
    const remainingParams = findUnprocessedParams(html);
    if (remainingParams.length > 0) {
      logger.warn(`Template has unprocessed parameters: ${remainingParams.join(', ')}`);
    }
    
    return { subject, html };
  } catch (error) {
    logger.error(`Error processing template: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Find any remaining unprocessed parameters
function findUnprocessedParams(content: string): string[] {
    const paramRegex = /{{([^{}]+)}}/g;
    const matches = [...content.matchAll(paramRegex)];
    return matches.map(match => match[1].trim());
  }
  
  // Add link tracking to HTML content
  export function addLinkTracking(
    html: string,
    campaignId: string,
    recipientId: string,
    baseUrl: string
  ): string {
    try {
      // Match all anchor tags with href attributes
      const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']*)["']([^>]*)>(.*?)<\/a>/gi;
      
      // Replace links with tracked versions
      return html.replace(linkRegex, (match, url, attrs, linkText) => {
        // Skip tracking for anchors, mailto, tel links
        if (url.startsWith('#') || url.startsWith('mailto:') || url.startsWith('tel:')) {
          return match;
        }
        
        // Create tracking URL
        const trackingUrl = `${baseUrl}/api/track/click?c=${campaignId}&r=${recipientId}&url=${encodeURIComponent(url)}&t=${Date.now()}`;
        
        // Return tracked link
        return `<a href="${trackingUrl}"${attrs}>${linkText}</a>`;
      });
    } catch (error) {
      logger.error(`Error adding link tracking: ${error instanceof Error ? error.message : String(error)}`);
      return html; // Return original HTML on error
    }
  }