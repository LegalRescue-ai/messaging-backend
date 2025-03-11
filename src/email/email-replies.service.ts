import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

interface SendbirdUserMetadata {
  role?: string;
  email?: string;
}

interface EmailData {
  id: string;
  templateParams: {
    since?: string;
    from_name?: string;
    to_email?: string;
    message?: string;
    channel_url?: string;
    attachments?: Array<{ url: string; filename: string }>;
  };
  status: 'pending' | 'queued' | 'failed';
  createdAt: string;
  assignedTo?: string;
  attempts?: number;
  error?: any;
  lastAttempt?: string;
  from?: string;
  replyBody?: string;
  threadId?: string;
  attachments?: Array<{ url: string; filename: string }>;
}

@Injectable()
export class EmailRepliesService implements OnModuleInit {
  private readonly logger = new Logger(EmailRepliesService.name);
  private socketServer: Server;
  private readonly pendingEmails: Map<string, EmailData> = new Map();
  private readonly connectedClients: Set<string> = new Set();
  private readonly emailConfig: {
    serviceId: string;
    templateId: string;
    publicKey: string;
  };

  constructor(
    private readonly sendbirdService: SendbirdService,
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {    
    // Initialize email configuration
    this.emailConfig = {
      serviceId: 'service_cyvc9k9',
      templateId: 'template_x37o5pi',
      publicKey: 'sJu2tjaxzTDc1yhjv'
    };

    // Validate configuration
    if (!this.emailConfig.serviceId || !this.emailConfig.templateId || !this.emailConfig.publicKey) {
      throw new Error('Missing required EmailJS configuration');
    }

    this.logger.log('EmailJS configuration initialized:', {
      serviceId: this.emailConfig.serviceId,
      templateId: this.emailConfig.templateId
    });
  }

  setSocketServer(server: Server) {
    this.socketServer = server;
  }

  async onModuleInit() {
    // Configuration is now handled in constructor
  }

  handleConnection(clientId: string) {
    this.connectedClients.add(clientId);
    this.logger.log(`Client ${clientId} connected. Total clients: ${this.connectedClients.size}`);
    this.delegateQueuedEmails(clientId);
  }

  handleDisconnect(clientId: string) {
    this.connectedClients.delete(clientId);
    this.logger.log(`Client ${clientId} disconnected. Total clients: ${this.connectedClients.size}`);
    this.reassignPendingEmails(clientId);
  }

  async handleEmailSent(clientId: string, data: { emailId: string; success: boolean; response?: any }) {
    if (this.pendingEmails.has(data.emailId)) {
      const emailData = this.pendingEmails.get(data.emailId)!;
      if (emailData.from && emailData.replyBody && emailData.threadId) {
        await this.processReply(
          emailData.from,
          emailData.replyBody,
          emailData.threadId,
          emailData.attachments
        );
      }
      this.logger.log(`Email ${data.emailId} processed successfully by client ${clientId}`, data.response);
      this.pendingEmails.delete(data.emailId);
    }
  }

  handleEmailError(clientId: string, data: { emailId: string; error: any }) {
    if (this.pendingEmails.has(data.emailId)) {
      const emailData = this.pendingEmails.get(data.emailId)!;
      this.logger.error(`Email ${data.emailId} failed to send from client ${clientId}:`, data.error);

      emailData.status = 'failed';
      emailData.error = data.error;
      emailData.lastAttempt = new Date().toISOString();
      emailData.attempts = (emailData.attempts || 0) + 1;

      if (emailData.attempts < 3 && this.connectedClients.size > 0) {
        const availableClients = Array.from(this.connectedClients).filter(id => id !== clientId);
        if (availableClients.length > 0) {
          const newClientId = availableClients[0];
          emailData.assignedTo = newClientId;
          emailData.status = 'pending';
          this.pendingEmails.set(data.emailId, emailData);
          this.socketServer.to(newClientId).emit('send-email', this.createEmailPayload(emailData));
          this.logger.log(`Retrying email ${data.emailId} with client ${newClientId}`);
        }
      }
    }
  }

  private validateTemplateParams(params: any): boolean {
    const requiredFields = ['from_name', 'to_email', 'message'];
    
    // Check all required fields exist and are not empty
    for (const field of requiredFields) {
      if (!params[field] || typeof params[field] !== 'string' || !params[field].trim()) {
        this.logger.error(`Missing or invalid required template parameter: ${field}`);
        return false;
      }
    }
    
    // Validate attachments if present
    if (params.attachments) {
      if (!Array.isArray(params.attachments)) {
        this.logger.error('Attachments must be an array');
        return false;
      }
      
      // Validate each attachment
      for (const attachment of params.attachments) {
        if (!attachment.url || !attachment.filename) {
          this.logger.error('Each attachment must have url and filename properties');
          return false;
        }
      }
    }
    
    return true;
  }

  private createEmailPayload(emailData: EmailData) {
    const payload = {
      id: emailData.id || uuidv4(),
      serviceId: this.emailConfig.serviceId,
      templateId: this.emailConfig.templateId,
      templateParams: emailData.templateParams,
      from: emailData.from,
      replyBody: emailData.replyBody,
      threadId: emailData.threadId,
      attachments: emailData.attachments
    };

    // Validate template parameters before sending
    if (!this.validateTemplateParams(payload.templateParams)) {
      this.logger.error(`Invalid template parameters for email ${payload.id}:`, payload.templateParams);
      throw new Error('Invalid template parameters');
    }

    return payload;
  }

  async queueEmailNotification(emailData: EmailData) {
    if (this.connectedClients.size === 0) {
      this.logger.warn('No connected clients available to process email');
      emailData.status = 'queued';
      this.pendingEmails.set(emailData.id, emailData);
      return;
    }

    // Choose a client using round-robin
    const clientId = Array.from(this.connectedClients)[0];
    emailData.assignedTo = clientId;
    emailData.status = 'pending';

    this.pendingEmails.set(emailData.id, emailData);
    
    try {
      const payload = this.createEmailPayload(emailData);
      this.socketServer.to(clientId).emit('send-email', payload);
      this.logger.log(`Email notification ${emailData.id} delegated to client ${clientId}`);
    } catch (error) {
      this.logger.error(`Failed to queue email notification ${emailData.id}:`, error);
      emailData.status = 'failed';
      emailData.error = error;
      this.pendingEmails.set(emailData.id, emailData);
    }
  }

  private delegateQueuedEmails(clientId: string) {
    const queuedEmails = Array.from(this.pendingEmails.entries())
      .filter(([_, email]) => email.status === 'queued')
      .map(([id, email]) => ({ ...email, id }));

    if (queuedEmails.length > 0) {
      this.logger.log(`Delegating ${queuedEmails.length} queued emails to client ${clientId}`);
      queuedEmails.forEach(email => {
        const updatedEmail: EmailData = {
          ...email,
          status: 'pending',
          assignedTo: clientId
        };
        this.pendingEmails.set(email.id, updatedEmail);
        this.socketServer.to(clientId).emit('send-email', this.createEmailPayload(updatedEmail));
      });
    }
  }

  private reassignPendingEmails(clientId: string) {
    const assignedEmails = Array.from(this.pendingEmails.entries())
      .filter(([_, email]) => email.assignedTo === clientId && email.status === 'pending')
      .map(([id, email]) => ({ ...email, id }));

    if (assignedEmails.length > 0 && this.connectedClients.size > 0) {
      const availableClients = Array.from(this.connectedClients);
      assignedEmails.forEach((email, index) => {
        const newClientId = availableClients[index % availableClients.length];
        const updatedEmail: EmailData = { ...email, assignedTo: newClientId };
        this.pendingEmails.set(email.id, updatedEmail);
        this.socketServer.to(newClientId).emit('send-email', this.createEmailPayload(updatedEmail));
      });
      this.logger.log(`Reassigned ${assignedEmails.length} emails from disconnected client ${clientId}`);
    } else if (assignedEmails.length > 0) {
      assignedEmails.forEach(email => {
        const updatedEmail: EmailData = { ...email, status: 'queued', assignedTo: undefined };
        this.pendingEmails.set(email.id, updatedEmail);
      });
      this.logger.log(`Marked ${assignedEmails.length} emails as queued (no clients available)`);
    }
  }

  async processReply(from: string, replyBody: string, threadId: string, attachments?: Array<{ url: string; filename: string }>) {
    try {
      // Process reply logic here
      this.logger.log(`Processing reply from ${from} in thread ${threadId}`);
    } catch (error) {
      this.logger.error('Error processing reply:', error);
      throw error;
    }
  }
}
