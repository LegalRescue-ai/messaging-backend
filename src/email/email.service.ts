/* eslint-disable prettier/prettier */
// src/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SendbirdService } from 'src/sendbird/sendbird.service';
import { JSDOM } from 'jsdom';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private oAuth2Client;
  private gmail;
  private credentials;

  constructor(private configService: ConfigService, private sendbirdService: SendbirdService) {
    const credentialsPath = path.join('credentials.json');
    this.credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8')).web;
    this.oAuth2Client = new google.auth.OAuth2(
      this.credentials.client_id,
      this.credentials.client_secret,
      this.credentials.redirect_uris[0],
    );
    this.gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });

    // Load tokens from config or storage
    const token = JSON.parse(fs.readFileSync('token.json').toString());
    this.oAuth2Client.setCredentials(token);
  }

  async getGoogleCallback(code: string): Promise<void | string> {
    if (!code) return 'No code received.'

    try {
      const { tokens } = await this.oAuth2Client.getToken(code);
      this.oAuth2Client.setCredentials(tokens);
      fs.writeFileSync('token.json', JSON.stringify(tokens));

      this.logger.log('🎉 Tokens saved:', tokens);
      return '✅ Gmail Access Token & Refresh Token saved to token.json';
    } catch (err) {
      this.logger.log('Error retrieving tokens');
    }
  }

  async authorizeGmailApi(): Promise<void> {
    const authUrl = this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      prompt: 'consent',
    });
    return authUrl;
  }

  async receiveEmails(): Promise<void> {
    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:inbox is:unread', // Efficiently get only unread messages
      });

      const messages = response.data.messages || [];
      for (const email of messages) {
        if (this.configService.get(email.threadId)) {
          try {
            // 1. Fetch the Sendbird message using threadId (from metadata)
            const sendbirdMetadata = await this.configService.get(email.threadId);
            const { channel, recipient } = sendbirdMetadata;
            if (sendbirdMetadata && channel && recipient) {
              // 2. Send the email reply to Sendbird
              await this.sendbirdService.sendMessage(channel.channel_url, recipient.user_id, (await this.getMessage(email.id)).body)
              this.configService.set(email.threadId, null);
            }

          } catch (sendbirdError) {
            this.logger.error(`Error processing reply for thread ${email.threadId}: ${sendbirdError.message}`, sendbirdError.stack);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error receiving emails: ${error.message}`, error.stack);
    }
  } async getMessage(messageId: string): Promise<any> {
    try {
      const messageResponse = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });


      const payload = messageResponse.data.payload;
      const headers = payload.headers.reduce(
        (acc, header) => ({ ...acc, [header.name]: header.value }),
        {},
      );
      const sender = headers['From'];
      const subject = headers['Subject'];
      const threadId = messageResponse.data.threadId;

      let body = '';
      let attachments: any = [];

      // Function to recursively search for text/plain or text/html parts
      const findBodyParts = (part) => {
        if (!part) return;

        // Process this part if it's text
        if (part.mimeType === 'text/plain' && part.body && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          return true;
        } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          return true;
        } else if (part.filename && part.body && part.body.attachmentId) {
          // Process attachment
          this.gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: part.body.attachmentId,
          }).then(attachmentResponse => {
            const attachmentData = Buffer.from(
              attachmentResponse.data.data,
              'base64',
            );
            attachments.push({ filename: part.filename, data: attachmentData });
          });
        }

        // Recursively search nested parts
        if (part.parts) {
          for (const subpart of part.parts) {
            if (findBodyParts(subpart)) return true;
          }
        }

        return false;
      };

      // First handle simple body case
      if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
      // Then try to find parts recursively if we don't have a body yet
      else if (payload.parts) {
        findBodyParts(payload);
      }



      // If we still have no body, log it
      if (!body) {
        console.log("Warning: No body content found in message");
        // You could return a default message or empty string
        body = "";
      }

      return {
        messageId,
        sender,
        subject,
        body: this.cleanEmailContent(body),
        attachments,
        threadId
      };
    } catch (error) {
      this.logger.error(
        `Error getting message ${messageId}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }
  async sendEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: { filename: string; data: Buffer }[],
  ): Promise<any> {
    try {
      const raw = this.createRawEmail(to, subject, body, attachments);
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
      });
      this.logger.log(`Email sent to ${to}: ${response.data
        ? response.data.id : 'No response data'}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error sending email to ${to}: ${error.message}`,
        error.stack,
      );
      return null;
    }
  }

  private cleanEmailContent(html: string) {
    if (!html || html.trim() === '') {
      return '';
    }

    // Check if this is already plain text with quotation marks
    if (html.includes('> ') && !html.includes('<')) {
      // This is already plaintext with quote indicators

      // Extract only the content before the first "On ... wrote:" line
      const onWrotePattern = /On\s.*wrote:[\s\S]*/i;
      let text = html.replace(onWrotePattern, '');

      // If there's nothing left, just return the first line
      if (!text.trim()) {
        const firstLine = html.split('\n')[0];
        return firstLine.trim();
      }

      return text.trim();
    }

    try {
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Remove images
      const images = document.querySelectorAll('img');
      images.forEach(img => img.remove());

      // Remove data:image in style attributes
      const elementsWithDataImage = document.querySelectorAll('[style*="data:image"]');
      elementsWithDataImage.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
          el.setAttribute('style', style.replace(/url\(\s*data:image\/[^;]+;base64,[^\)]*\)/g, ''));
        }
      });

      // Remove all quote elements
      const quoteSelectors = ['.gmail_quote', 'blockquote'];
      quoteSelectors.forEach(selector => {
        const quotes = document.querySelectorAll(selector);
        quotes.forEach(el => el.remove());
      });

      // Replace <div> tags with newline-separated content
      const divs = document.querySelectorAll('div');
      divs.forEach(div => {
        const textNode = document.createTextNode('\n' + div.textContent);
        div.replaceWith(textNode);
      });

      // Extract text
      let text = document.body.textContent || '';

      // Remove any "On ... wrote:" lines and everything after
      const onWrotePattern = /On\s.*wrote:[\s\S]*/i;
      text = text.replace(onWrotePattern, '');

      return text.trim();
    } catch (error) {
      // Fallback for any errors
      // Extract only the content before the first "On ... wrote:" line
      const onWrotePattern = /On\s.*wrote:[\s\S]*/i;
      let text = html.replace(onWrotePattern, '');

      // Also remove any quoted lines starting with ">"
      text = text.replace(/^>.*$/gm, '');

      // If there's nothing left, just return the first line
      if (!text.trim()) {
        const lines = html.split('\n');
        return lines[0].trim();
      }

      return text.trim();
    }
  }
  private getLogoAsBase64(): { base64Data: string; mimeType: string } {
    try {
      // Get logo from assets folder (typical NestJS structure)
      const logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
      const logoData = fs.readFileSync(logoPath);
      const base64Logo = logoData.toString('base64');

      // Get file extension for correct MIME type (assuming PNG, modify if different)
      const fileExtension = logoPath.split('.').pop()?.toLowerCase();
      let mimeType = 'image/png'; // Default

      if (fileExtension === 'jpg' || fileExtension === 'jpeg') {
        mimeType = 'image/jpeg';
      } else if (fileExtension === 'gif') {
        mimeType = 'image/gif';
      }

      return { base64Data: base64Logo, mimeType };
    } catch (error) {
      console.error('Error loading logo:', error);
      return { base64Data: '', mimeType: '' };
    }
  }

  public createRawEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: { filename: string; data: Buffer }[],
  ): string {
    const boundary = 'boundary_000000';

    // Get the logo data
    const { base64Data: logoBase64, mimeType } = this.getLogoAsBase64();

    // Create HTML email
    let htmlBody = body;

    // Add footer with text
    htmlBody += `
    <hr style="margin-top: 30px; border: 0; border-top: 1px solid #eee;">
    <div style="margin-top: 20px; text-align: left;">
      <p style="font-size: 12px; color: #666; margin-bottom: 15px;">
        You can reply to this email directly or log on to: 
        <a href="${this.configService.get("clientEndpoint")}">LegalRescue.ai</a>
      </p>`;


    // Add logo if available, centered and larger

    if (logoBase64) {
      htmlBody += `
    <div style="text-align: left; margin: 15px auto; ">
      <img src="data:${mimeType};base64,${logoBase64}" alt="Company Logo" style="width: 100%; max-height: 150px; object-fit: contain;" />
    </div>`;
    }

    htmlBody += `
    </div>`;

    // Create message parts
    const messageParts = [
      `From: ${this.credentials.client_email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlBody,
    ];

    // Add attachments
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const encodedAttachment = attachment.data.toString('base64');
        messageParts.push(
          `--${boundary}`,
          `Content-Type: application/octet-stream; name="${attachment.filename}"`,
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          encodedAttachment
        );
      }
    }

    messageParts.push(`--${boundary}--`);
    const message = messageParts.join('\r\n');

    return Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  // Utility function for NestJS (non-browser environment)




  @Cron('0 */3 * * * *')
  async checkEmails(): Promise<void> {
    this.logger.log('Checking emails...');
    await this.authorizeGmailApi();
    await this.receiveEmails();
  }
}
