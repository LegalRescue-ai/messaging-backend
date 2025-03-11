import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as emailjs from '@emailjs/nodejs';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {
    // Initialize EmailJS with your credentials
    emailjs.init({
      publicKey: this.configService.get<string>('EMAILJS_PUBLIC_KEY')!,
      privateKey: this.configService.get<string>('EMAILJS_PRIVATE_KEY')!,
    });
  }

  async sendMessageNotification(
    to: string,
    fromName: string,
    message: string,
    threadId: string,
    attachments?: { url: string; filename: string }[],
  ): Promise<boolean> {
    try {
      const templateParams = {
        to_email: to,
        from_name: fromName,
        message: message,
        thread_id: threadId,
        attachments: attachments ? JSON.stringify(attachments) : undefined,
      };

      const response = await emailjs.send(
        this.configService.get<string>('EMAILJS_SERVICE_ID')!,
        this.configService.get<string>('EMAILJS_TEMPLATE_ID')!,
        templateParams,
      );

      if (response.status === 200) {
        this.logger.log(`Email notification sent successfully to ${to}`);
        return true;
      }

      this.logger.error(`Failed to send email: ${response.text}`);
      return false;
    } catch (error) {
      this.logger.error(`Error sending email notification: ${error.message}`, error.stack);
      return false;
    }
  }

  async sendBulkNotification(
    recipients: { email: string; name: string }[],
    subject: string,
    message: string,
    attachments?: { url: string; filename: string }[],
  ): Promise<boolean> {
    try {
      const templateParams = {
        recipients: JSON.stringify(recipients),
        subject,
        message,
        attachments: attachments ? JSON.stringify(attachments) : undefined,
      };

      const response = await emailjs.send(
        this.configService.get<string>('EMAILJS_SERVICE_ID')!,
        this.configService.get<string>('EMAILJS_BULK_TEMPLATE_ID')!,
        templateParams,
      );

      if (response.status === 200) {
        this.logger.log(`Bulk email notification sent successfully to ${recipients.length} recipients`);
        return true;
      }

      this.logger.error(`Failed to send bulk email: ${response.text}`);
      return false;
    } catch (error) {
      this.logger.error(`Error sending bulk email notification: ${error.message}`, error.stack);
      return false;
    }
  }
}
