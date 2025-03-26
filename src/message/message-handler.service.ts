import { Injectable, Logger } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';
import * as SendBird from 'sendbird';
import { EmailService } from 'src/email/email.service';

interface MessageNotificationData {
  messageId: number;
  channelUrl: string;
  senderId: string;
  message: string;
  createdAt: number;
  senderMetadata?: {
    role?: string;
    email?: string;
  };
  recipientMetadata?: {
    role?: string;
    email?: string;
  };
}

@Injectable()
export class MessageHandlerService {
  private readonly logger = new Logger(MessageHandlerService.name);

  constructor(
    private readonly sendbirdService: SendbirdService,
    private readonly emailService: EmailService,
  ) {}

  async handleNewMessage(message: SendBird.UserMessage, channel: SendBird.GroupChannel) {
    try {
      // Validate message has required properties
      if (!message.sender || !message.messageId || !message.message) {
        this.logger.error('Invalid message received: missing required properties');
        return;
      }

      // Get sender and recipient information
      const members = await this.getChannelMembers(channel);
      const sender = members.find(m => m.userId === message.sender!.userId);
      const recipient = members.find(m => m.userId !== message.sender!.userId);

      if (!sender || !recipient) {
        this.logger.error('Could not find sender or recipient in channel members');
        return;
      }

      const notificationData: MessageNotificationData = {
        messageId: message.messageId,
        channelUrl: channel.url,
        senderId: sender.userId,
        message: message.message || '',
        createdAt: message.createdAt,
        senderMetadata: sender.metaData as { role?: string; email?: string },
        recipientMetadata: recipient.metaData as { role?: string; email?: string }
      };

      await this.processMessageNotification(notificationData);
    } catch (error) {
      this.logger.error('Error handling new message:', error);
    }
  }

  private async getChannelMembers(channel: SendBird.GroupChannel): Promise<SendBird.User[]> {
    return new Promise((resolve, reject) => {
      const query = channel.createMemberListQuery();
      query.limit = 2; // We only need the two participants
      query.next((members, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(members);
      });
    });
  }

  private async processMessageNotification(data: MessageNotificationData) {
    try {
      // Only send email notifications if we have recipient email
      if (data.recipientMetadata?.email) {
        const emailData = {
          id: `msg_${data.messageId}`,
          templateParams: {
            from_name: data.senderMetadata?.role || 'User',
            to_email: data.recipientMetadata.email,
            message: data.message,
            channel_url: data.channelUrl,
            since: new Date(data.createdAt).toISOString()
          },
          status: 'pending' as const,
          createdAt: new Date().toISOString(),
        };

        this.logger.log('Queueing email notification:', {
          messageId: data.messageId,
          recipientEmail: data.recipientMetadata.email,
          channelUrl: data.channelUrl
        });

        await this.emailService.sendEmail(emailData.templateParams.to_email, 'New message received', emailData.templateParams.message);
      }
    } catch (error) {
      this.logger.error('Error processing message notification:', error);
    }
  }
}
