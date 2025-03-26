import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifySignature } from './utils/signature.util';
import { SendbirdService } from '../sendbird/sendbird.service';
import { EmailService } from '../email/email.service';
import axios from 'axios';
import { send } from '@emailjs/nodejs';

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
        case 'group_channel:message_send':
          const messagePayload = {channel: payload.channel, payload:payload.payload, sender: payload.sender, type:payload.type, url:payload.url};
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
        const recipientEmail = recipientUser?.metadata['email'];

        if (!recipientEmail) {
          this.logger.warn(`No email found for recipient ${recipient.userId}`);
          continue;
        }

        if(payload.message){
          const emailResponse = await this.emailService.sendEmail(
            recipientEmail,
            'Legal Rescue notifications: New message from ' + sender.nickname,
            payload.message);
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

        else if(payload.url){
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
            'Legal Rescue notifications: New message from ' + sender.nickname,
            `${sender.nickname} shared a file with you:`,
            [{ filename: payload.url, data:image.data }],
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
      if([ 400300, 400301, 400302, 400310 ].includes( error.code)){
        // this.configService.set(data.sender.userId, {});
        this.sendbirdService.reconnect();
      }
      // Don't throw the error to prevent webhook failure
    }

    return { success: true };
  }
}
