/* eslint-disable prettier/prettier */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifySignature } from './utils/signature.util';
import { SendbirdService } from '../sendbird/sendbird.service';
import { EmailService } from '../email/email.service';
import axios from 'axios';
import { DynamoService } from 'src/dynamo/dynamo.service';


@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private configService: ConfigService,
    private readonly sendbirdService: SendbirdService,
    private readonly emailService: EmailService,
    private readonly dynamoService: DynamoService
  ) { }

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
        case 'group_channel:message_send':
          const messagePayload = { channel: payload.channel, payload: payload.payload, sender: payload.sender, type: payload.type, url: payload.url };
          await this.handleMessageSent(messagePayload);
          break;
        case 'group_channel:file':
          await this.handleMessageSent(payload); // File uploads are handled the same way as messages
          break;
        default:
          this.logger.warn(
            `Unhandled webhook event category: ${payload.category}`,
          );
          return { success: false, message: 'Unhandled event category' };
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Error handling webhook event: ${error.message}`, error.stack);
      throw error;
    }
  }


  private async handleMessageSent(data: any) {
    try {
      const {
        sender,
        channel,
        payload,
        type,
        url
      } = data;
      if (!sender) {
        this.logger.error('Message sent without sender information');
        return { success: false };
      }

      // Get channel members except the sender
      const members = await this.sendbirdService.getGroupChannelMembers(sender.user_id, channel.channel_url);
      const recipients = members.filter(member => member.userId !== sender.user_id);

      // Send email notification to each recipient
      for (const recipient of recipients) {
        // Get recipient's email from metadata
        const recipientUser = await this.sendbirdService.getUserById(recipient.userId);
        const recipientSession = await this.sendbirdService.getUserSessions(recipientUser.user_id);
        const recipientEmail = await this.getRecipientUserInfoFromDatabase(recipient.userId, recipientUser.metadata.role);

        if (!recipientEmail) {
          this.logger.warn(`No email found for recipient ${recipient.userId}`);
          continue;
        }

        // Create dynamic subject line based on recipient's role
        let emailSubject = 'Legal Rescue notifications: New message from ' + sender.nickname;

        if (recipientUser.metadata.role === 'client') {
          const firmName = await this.getSenderInfoFromDatabase(sender.user_id);
          emailSubject = `New message from an attorney: ${sender.nickname} - ${firmName || ''}`;
        } else if (recipientUser.metadata.role === 'attorney') {
          emailSubject = `New message from a client: ${sender.nickname}`;
        }
        // For other roles, the default subject line is used

        if (payload.message) {
          const emailResponse = await this.emailService.sendEmail(
            recipientEmail,
            emailSubject,
            payload.message,
            undefined,  // attachments parameter
            recipientUser.metadata.role  // pass the recipient's role
          );

          this.configService.set(emailResponse.threadId, {
            sender: this.sendbirdService.getCurrentUser(),
            recipient: recipientUser,
            channel: channel,
            payload: payload,
            type: type,
            url: url,
          });

          this.logger.log(
            `Sent email notification to ${recipientEmail} for message ${payload.message_id}`,
          );
          return;
        }
        else if (payload.url) {
          const image = await axios.get(
            `${payload.url}?auth=${recipientSession}`,
            {
              headers: {
                'Api-Token':
                  this.configService.get<string>('sendbird.apiToken'),
                'Session-Token': recipientSession,
              },
              responseType: 'arraybuffer',
            },
          );

          const emailResponse = await this.emailService.sendEmail(
            recipientEmail,
            emailSubject,
            `${sender.nickname} shared a file with you:`,
            [{ filename: payload.url, data: image.data }],
            recipientUser.metadata.role  // pass the recipient's role
          );

          this.configService.set(emailResponse.threadId, {
            sender: this.sendbirdService.getCurrentUser(),
            recipient: recipientUser,
            channel: channel,
            payload: payload,
            type: type,
            url: url,
          });

          this.logger.log(
            `Sent email notification to ${recipientEmail} for message ${payload.message_id}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Error handling new message: ${error.message}`, error.stack);
      if ([400300, 400301, 400302, 400310].includes(error.code)) {
        this.sendbirdService.reconnect();
      }
      // Don't throw the error to prevent webhook failure
    }

    return { success: true };
  }

  private async getRecipientUserInfoFromDatabase(userId: string, role?: 'attorney' | 'client'): Promise<any> {
    console.log(role);

    // If role is specified, only check that table
    if (role) {
      const tableName = role === 'attorney' ? 'attorneys' : 'users';
      try {
        const result = await this.dynamoService.getItem(tableName, { id: userId });
        if (result) {
          return result.email || null;
        }
        return null;
      } catch (error) {
        this.logger.error(`Error fetching email for user ${userId}: ${error.message}`);
        return null;
      }
    }

    // If no role is specified, check attorneys table first, then users table
    try {
      const attorneyResult = await this.dynamoService.getItem('attorneys', { id: userId });
      if (attorneyResult && attorneyResult.email) {
        return attorneyResult.email;
      }

      // If not found in attorneys table, check users table
      const userResult = await this.dynamoService.getItem('users', { id: userId });
      if (userResult) {
        return userResult.email || null;
      }
      return null;
    } catch (error) {
      this.logger.error(`Error fetching email for user ${userId} from both tables: ${error.message}`);
      return null;
    }
  }

  private async getSenderInfoFromDatabase(userId: string): Promise<any> {
    try {
      const attorneyResult = await this.dynamoService.getItem('attorneys', { id: userId });
      if (attorneyResult && attorneyResult.firmName) {
        return attorneyResult.firmName;
      }
      return null;
    } catch (error) {
      this.logger.error(`Error fetching firm name for attorney ${userId}: ${error.message}`);
      return null;
    }
  }
}