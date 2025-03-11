import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifySignature } from './utils/signature.util';
import { SendbirdService } from '../sendbird/sendbird.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private configService: ConfigService,
    private readonly sendbirdService: SendbirdService,
    private readonly emailService: EmailService,
  ) {}

  async verifyWebhookSignature(signature: string, webhookSecret: string): Promise<boolean> {
    if (!webhookSecret) {
      this.logger.error('Webhook secret not configured');
      return false;
    }
    return verifySignature(signature, webhookSecret);
  }

  async handleWebhookEvent(payload: any, signature: string): Promise<any> {
    try {
      const webhookSecret = this.configService.get<string>('sendbird.webhookSecret');
      if (!webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const isValid = await this.verifyWebhookSignature(signature, webhookSecret);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      switch (payload.category) {
        case 'message':
          await this.handleMessageSent(payload);
          break;
        case 'file':
          await this.handleMessageSent(payload); // File uploads are handled the same way as messages
          break;
        default:
          this.logger.warn(`Unhandled webhook event category: ${payload.category}`);
          return { success: false, message: 'Unhandled event category' };
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Error handling webhook event: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async handleMessageSent(payload: any) {
    try {
      const { 
        sender,
        channelUrl,
        message,
        messageId,
        type,
        url,
        name
      } = payload;

      if (!sender) {
        this.logger.error('Message sent without sender information');
        return { success: false };
      }

      // Get channel members except the sender
      const members = await this.sendbirdService.getGroupChannelMembers(channelUrl);
      const recipients = members.filter(member => member.userId !== sender.userId);

      // Send email notification to each recipient
      for (const recipient of recipients) {
        // Get recipient's email from metadata
        const recipientEmail = (recipient.metaData as { email?: string })?.email;
        if (!recipientEmail) {
          this.logger.warn(`No email found for recipient ${recipient.userId}`);
          continue;
        }

        // Check for file type message
        const fileUrl = type === 'FILE' ? url : undefined;
        const attachments = fileUrl ? [{ url: fileUrl, filename: name || 'attachment' }] : undefined;

        await this.emailService.sendMessageNotification(
          recipientEmail,
          sender.nickname || 'User',
          message || 'Shared a file',
          messageId,
          attachments,
        );

        this.logger.log(`Sent email notification to ${recipientEmail} for message ${messageId}`);
      }
    } catch (error) {
      this.logger.error(`Error handling new message: ${error.message}`, error.stack);
      // Don't throw the error to prevent webhook failure
    }

    return { success: true };
  }
}
