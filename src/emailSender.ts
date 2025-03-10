import nodemailer from 'nodemailer';
import { EmailTask, TaskResult } from './types';

// Fungsi untuk mengirim email
export async function processEmailTask(task: EmailTask): Promise<TaskResult> {
  try {
    // Extract data from task
    const { recipient, template, smtpConfig, parameters } = task;
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      },
    });
    
    // Prepare email content
    const emailContent = prepareEmailContent(template, recipient, parameters);
    
    // Send email
    const info = await transporter.sendMail({
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: recipient.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });
    
    // Return success result
    return {
      taskId: task.id,
      success: true,
      messageId: info.messageId,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    // Return failure result
    return {
      taskId: task.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    };
  }
}

// Helper function to prepare email content
function prepareEmailContent(
  template: EmailTask['template'],
  recipient: EmailTask['recipient'],
  parameters?: Record<string, string>
) {
  // Default parameters from recipient data
  const defaultParams: Record<string, string> = {
    email: recipient.email,
    name: recipient.name || recipient.email,
  };
  
  // Add metadata fields
  if (recipient.metadata) {
    Object.entries(recipient.metadata).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        defaultParams[key] = String(value);
      }
    });
  }
  
  // Merge with provided parameters
  const allParams = {
    ...defaultParams,
    ...(parameters || {}),
  };
  
  // Replace parameters in subject and body
  let subject = template.subject;
  let html = template.htmlContent;
  
  // Replace all parameters in the format {{parameter}}
  Object.entries(allParams).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    subject = subject.replace(regex, value);
    html = html.replace(regex, value);
  });
  
  return { subject, html };
}