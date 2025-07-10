/* eslint-disable prettier/prettier */
// src/email/email.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
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
    } catch {
      this.logger.log('Error retrieving tokens');
    }
  }

  async authorizeGmailApi(): Promise<string> {
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
        if (!email || !email.id) continue;
        
        let emailProcessed = false;
        
        // Method 1: Try original configService mapping first (for backward compatibility)
        if (this.configService.get(email.threadId)) {
          try {
            const sendbirdMetadata = await this.configService.get(email.threadId);
            const { channel, recipient } = sendbirdMetadata;
            if (sendbirdMetadata && channel && recipient) {
              const emailMessage = await this.getMessage(email.id);
              if (emailMessage) {
                await this.sendbirdService.sendMessage(channel.channel_url, recipient.user_id, emailMessage.body);
                this.configService.set(email.threadId, null);
                this.logger.log(`Processed email reply via configService mapping for channel ${channel.channel_url}`);
                emailProcessed = true;
              }
            }
          } catch (sendbirdError) {
            this.logger.error(`Error processing reply via configService for thread ${email.threadId}: ${sendbirdError.message}`, sendbirdError.stack);
          }
        }
        // Method 2: Try channel metadata mapping as fallback (for new threading system)
        else {
          const threadId = email.threadId;
          if (threadId) {
            const channelUrl = await this.sendbirdService.findChannelByThreadId(threadId);
            if (channelUrl) {
              const emailMessage = await this.getMessage(email.id);
              if (emailMessage) {
                // Use a system user for channel metadata replies
                await this.sendbirdService.sendMessage(channelUrl, 'system', emailMessage.body);
                this.logger.log(`Processed email reply via channel metadata for channel ${channelUrl}`);
                emailProcessed = true;
              }
            }
          }
        }

        // Mark email as read after successful processing to prevent duplicate processing
        if (emailProcessed) {
          await this.markEmailAsRead(email.id);
        }
      }
    } catch (error) {
      this.logger.error(`Error receiving emails: ${error.message}`, error.stack);
    }
  }

  private async markEmailAsRead(messageId: string): Promise<void> {
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
      this.logger.log(`Marked email ${messageId} as read`);
    } catch (error) {
      this.logger.error(`Error marking email ${messageId} as read: ${error.message}`, error.stack);
    }
  }

  async getMessage(messageId: string): Promise<{
    messageId: string;
    sender: string;
    subject: string;
    body: string;
    attachments: any[];
    threadId: string;
  } | null> {
    try {
      const messageResponse = await this.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      if (!messageResponse.data || !messageResponse.data.payload) {
        this.logger.error(`No data or payload found for message ${messageId}`);
        return null;
      }

      const payload = messageResponse.data.payload;
      const headers: Record<string, string> = (payload.headers || []).reduce(
        (acc: Record<string, string>, header: { name: string; value: string }) => ({ ...acc, [header.name]: header.value }),
        {},
      );
      const sender = headers['From'] || '';
      const subject = headers['Subject'] || '';
      const threadId = messageResponse.data.threadId || '';

      let body = '';
      const attachments: any[] = [];

      // Function to recursively search for text/plain or text/html parts
      const findBodyParts = (part: any): boolean => {
        if (!part) return false;

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
            if (attachmentResponse.data && attachmentResponse.data.data) {
              const attachmentData = Buffer.from(
                attachmentResponse.data.data,
                'base64',
              );
              attachments.push({ filename: part.filename, data: attachmentData });
            }
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
    recipientRole?: 'client' | 'attorney',
    channelUrl?: string // Optional: for email threading by channel
  ): Promise<any> {
    try {
      let threadId: string | undefined = undefined;
      let consistentSubject = subject;
      
      // If channelUrl is provided, try to get threadId from channel metadata for threading
      if (channelUrl) {
        const metadata = await this.sendbirdService.getChannelMetadata(channelUrl, ['email_thread_id', 'email_subject']);
        if (metadata && metadata.email_thread_id) {
          threadId = metadata.email_thread_id;
        }
        // Use consistent subject for thread continuity
        if (metadata && metadata.email_subject) {
          consistentSubject = metadata.email_subject;
        } else {
          // Store the case-based subject for future emails in this thread
          await this.sendbirdService.createChannelMetadata(channelUrl, 'email_subject', subject);
          consistentSubject = subject;
        }
      }
      
      const raw = this.createRawEmail(to, consistentSubject, body, attachments, recipientRole, threadId);
      // If threadId exists, include it in the Gmail API call for threading
      const requestBody: any = { raw };
      if (threadId) {
        requestBody.threadId = threadId;
      }
      
      const response = await this.gmail.users.messages.send({
        userId: 'me',
        requestBody,
      });
      
      this.logger.log(`Email sent to ${to}: ${response.data ? response.data.id : 'No response data'}`);
      
      // If this is the first email for this channel, store the threadId in channel metadata
      if (channelUrl && !threadId && response.data && response.data.threadId) {
        await this.sendbirdService.createChannelMetadata(channelUrl, 'email_thread_id', response.data.threadId);
      }
      
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

      // Extract only the content before various quote patterns
      const quotePatterns = [
        /On\s.*wrote:[\s\S]*/i,                    // Gmail/Standard: "On ... wrote:"
        /\n\s*_{5,}\s*\n\s*From:[\s\S]*/i,        // Outlook: Underscores followed by From: line (most specific)
        /_{5,}\s*[\r\n]\s*From:[\s\S]*/i,         // Alternative Outlook format
        /From:.*Sent:.*To:.*Subject:[\s\S]*/i,    // Outlook: "From: ... Sent: ... To: ... Subject:"
        /-----Original Message-----[\s\S]*/i,      // Outlook: "-----Original Message-----"
        /_{10,}[\s\S]*/,                          // Outlook: Long underscore lines (like ________________________________)
        /From:.*[\r\n].*Sent:[\s\S]*/i           // Outlook Web: "From: ... Sent: ..."
      ];
      
      let text = html;
      for (const pattern of quotePatterns) {
        const beforeReplace = text;
        text = text.replace(pattern, '');
        // If replacement was successful and we have content, stop
        if (text !== beforeReplace && text.trim()) break;
      }

      // Additional cleanup for any remaining quoted content
      text = text.replace(/^>.*$/gm, ''); // Remove lines starting with >
      
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

      // Remove all quote elements (enhanced for Outlook)
      const quoteSelectors = [
        '.gmail_quote', 
        'blockquote',
        '.OutlookMessageHeader',           // Outlook Web
        '.MsoNormal[style*="border"]',     // Outlook desktop quoted content
        '[class*="mso"]',                  // Microsoft Office classes
        '.elementToProof'                  // Outlook Web App
      ];
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

      // Remove various quote patterns (enhanced for Outlook) - most specific first
      const quotePatterns = [
        /\n\s*_{5,}\s*\n\s*From:[\s\S]*/i,        // Underscores followed by From: line (most specific)
        /_{5,}\s*[\r\n]\s*From:[\s\S]*/i,         // Alternative Outlook format
        /On\s.*wrote:[\s\S]*/i,                    // Gmail/Standard
        /From:.*Sent:.*To:.*Subject:[\s\S]*/i,    // Outlook desktop
        /-----Original Message-----[\s\S]*/i,      // Outlook
        /_{10,}[\s\S]*/,                          // Long underscore lines (like ________________________________)
        /From:.*[\r\n].*Sent:[\s\S]*/i,          // Outlook Web
        /\[cid:.*\]/g                             // Remove CID references
      ];
      
      for (const pattern of quotePatterns) {
        const beforeReplace = text;
        text = text.replace(pattern, '');
        // If replacement was successful and we have content, stop
        if (text !== beforeReplace && text.trim()) break;
      }

      return text.trim();
    } catch (error:any) {
    console.log(error)
      // Fallback for any errors (enhanced for Outlook)
      const quotePatterns = [
        /\n\s*_{5,}\s*\n\s*From:[\s\S]*/i,        // Underscores followed by From: line (most specific)
        /_{5,}\s*[\r\n]\s*From:[\s\S]*/i,         // Alternative Outlook format
        /On\s.*wrote:[\s\S]*/i,
        /From:.*Sent:.*To:.*Subject:[\s\S]*/i,
        /-----Original Message-----[\s\S]*/i,
        /_{10,}[\s\S]*/,                          // Long underscore lines
        /From:.*[\r\n].*Sent:[\s\S]*/i
      ];
      
      let text = html;
      for (const pattern of quotePatterns) {
        const beforeReplace = text;
        text = text.replace(pattern, '');
        // If replacement was successful and we have content, stop
        if (text !== beforeReplace && text.trim()) break;
      }

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
    recipientRole?: 'client' | 'attorney',
    threadId?: string
  ): string {
    const boundary = 'boundary_000000';

    // Get the logo data
    const { base64Data: logoBase64, mimeType } = this.getLogoAsBase64();

    // Create HTML email
    let htmlBody = body;
    htmlBody += `
  <p style="font-size: 12px;">`;

    if (recipientRole === 'client') {
      htmlBody += `You can respond to this attorney directly by replying to this email, or log on to: 
    <a href="${this.configService.get("clientEndpoint")}">LegalRescue.ai</a> to message the attorney in the "Message Center"`;
    } else if (recipientRole === 'attorney') {
      htmlBody += `You can respond to this client directly by replying to this email, or log on to: 
    <a href="${this.configService.get("clientEndpoint")}">LegalRescue.ai</a> to message the client in the "Message Center"`;
    } else {
      htmlBody += `You can reply to this email directly or log on to: 
    <a href="${this.configService.get("clientEndpoint")}">LegalRescue.ai</a>`;
    }

    htmlBody += `</p>`;

    if (logoBase64) {
      htmlBody += `
  <div style="text-align: left;">
    <img src="data:${mimeType};base64,${logoBase64}" alt="Company Logo" style="width: 100%; max-height: 150px; object-fit: contain;" />
  </div>`;
    }

    // Generate consistent Message-ID and threading headers
    const messageId = `<${Date.now()}-${Math.random().toString(36).substr(2, 9)}@legalrescue.ai>`;
    const references = threadId ? `<thread-${threadId}@legalrescue.ai>` : messageId;
    const inReplyTo = threadId ? `<thread-${threadId}@legalrescue.ai>` : undefined;

    // Create message parts
    const messageParts = [
      `From: ${this.credentials.client_email}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
    ];

    // Add threading headers if this is part of an existing thread
    if (threadId) {
      messageParts.push(`References: ${references}`);
      if (inReplyTo) {
        messageParts.push(`In-Reply-To: ${inReplyTo}`);
      }
    }

    messageParts.push(
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      '',
      htmlBody,
    );

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

  @Cron('0 */3 * * * *')
  async checkEmails(): Promise<void> {
    this.logger.log('Checking emails...');
    await this.authorizeGmailApi();
    await this.receiveEmails();
  }
}