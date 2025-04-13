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

  constructor(private configService: ConfigService,  private sendbirdService: SendbirdService) {
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
    const { tokens } = await this. oAuth2Client.getToken(code);
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
                        const {channel, recipient} = sendbirdMetadata; 
                        if(sendbirdMetadata && channel && recipient) {
                            // 2. Send the email reply to Sendbird
                          const newEmail = await this.getMessage(email.id);
                          await this.sendbirdService.sendMessage(channel.channel_url, recipient.user_id, newEmail.body, newEmail.attachments);
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
}
  async getMessage(messageId: string): Promise<any> {
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
      let attachments:any = [];

      if (payload.parts) {
        for (const part of payload.parts) {
          if (part.mimeType === 'text/plain') {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.mimeType === 'text/html') {
            body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          } else if (part.filename && part.body && part.body.attachmentId) {
            const attachmentResponse =
              await this.gmail.users.messages.attachments.get({
                userId: 'me',
                messageId: messageId,
                id: part.body.attachmentId,
              });
            const attachmentData = Buffer.from(
              attachmentResponse.data.data,
              'base64',
            );
            attachments.push({ filename: part.filename, data: attachmentData });
          }
        }
      } else if (payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      }
      return { messageId, sender, subject, body:this.cleanEmailContent(body), attachments, threadId };
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

  private cleanEmailContent(html:string) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Remove elements with class 'gmail_quote'
  const quotes = document.querySelectorAll('.gmail_quote');
  quotes.forEach(el => el.remove());

  // Replace <div> tags with newline-separated content
  const divs = document.querySelectorAll('div');
  divs.forEach(div => {
    const textNode = document.createTextNode('\n' + div.textContent);
    div.replaceWith(textNode);
  });

  // Extract all text (removing any other HTML tags)
  let text = document.body.textContent || '';
  return text.trim();
}


  private createRawEmail(
    to: string,
    subject: string,
    body: string,
    attachments?: { filename: string; data: Buffer }[],
  ): string {
    const boundary = 'boundary_000000';
    let messageParts = [
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
      body,
      '', // Add an extra empty line for spacing
      '<hr>', // Horizontal rule to separate the body from the footer
      '<p>', // Paragraph for the footer text
      'You can reply to this email directly or through our app: ',
      `<a href=${this.configService.get("clientEndpoint")}>Our App</a>`, // Clickable link
      '</p>',
    ];

    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        const encodedAttachment = attachment.data.toString('base64');
        messageParts = messageParts.concat([
          `--${boundary}`,
          `Content-Type: application/octet-stream; name="${attachment.filename}"`,
          `Content-Disposition: attachment; filename="${attachment.filename}"`,
          `Content-Transfer-Encoding: base64`,
          '',
          encodedAttachment,
        ]);
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


  @Cron(CronExpression.EVERY_MINUTE)
  async checkEmails(): Promise<void> {
    this.logger.log('Checking emails...');
    await this.authorizeGmailApi();
    await this.receiveEmails();
  }
}
