// src/email/email.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { ConfigService } from '@nestjs/config';
import { SendbirdService } from 'src/sendbird/sendbird.service';
import { google } from 'googleapis';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';

// Mock the googleapis library

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn().mockImplementation(() => ({
        generateAuthUrl: jest.fn(),
        getToken: jest.fn(),
        setCredentials: jest.fn(),
      })),
    },
    gmail: jest.fn().mockReturnValue({
      users: {
        messages: {
          send: jest.fn().mockResolvedValue({ data: { thread_id: 'test_message_id' } }),
          attachments: {
            get: jest.fn().mockResolvedValue([]),
          },
        },
      },
    }),
  },
}));

// Mock the fs module
jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

// Mock the SendbirdService
const mockSendbirdService = {
  sendMessage: jest.fn(),
};

describe('EmailService', () => {
  let emailService: EmailService;
  let configService: ConfigService;
  let sendbirdService: SendbirdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: SendbirdService,
          useValue: mockSendbirdService,
        },
      ],
    }).compile();

    emailService = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);
    sendbirdService = module.get<SendbirdService>(SendbirdService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(emailService).toBeDefined();
  });
  describe('getGoogleCallback', () => {
    it('should return "No code received." if no code is provided', async () => {
      const result = await emailService.getGoogleCallback('');
      expect(result).toBe('No code received.');
    });

  });

  describe('authorizeGmailApi', () => {
    it('should generate an authorization URL', () => {
      const oAuth2Mock = google.gmail({
        version: 'v1',
        auth: emailService['oAuth2Client'],
      }) as any;
      oAuth2Mock.generateAuthUrl = jest.fn().mockReturnValue('test_auth_url');

      const result = emailService.authorizeGmailApi();
      expect(oAuth2Mock.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.modify',
        ],
        prompt: 'consent',
      });
      expect(result).toBe('test_auth_url');
    });
  });

  describe('receiveEmails', () => {
    it('should process unread emails and send messages via Sendbird', async () => {
      const mockMessages = [{ threadId: 'thread123' }];
      const mockGmailResponse = { data: { messages: mockMessages } };
      const mockGetMessageResponse = { body: 'Test email body' };

      const gmailMock = google.gmail({
        version: 'v1',
        auth: emailService['oAuth2Client'],
      }).users.messages;
      gmailMock.list = jest.fn().mockResolvedValue(mockGmailResponse);
      gmailMock.get = jest.fn().mockResolvedValue(mockGetMessageResponse);


      (configService.get as jest.Mock).mockReturnValue({
        channel: { channel_url: 'test_channel_url' },
        recipient: { user_id: 'test_user_id' },
      });
      (sendbirdService.sendMessage as jest.Mock).mockResolvedValue({});

      await emailService.receiveEmails();

      expect(gmailMock.list).toHaveBeenCalledWith({
        userId: 'me',
        q: 'is:inbox is:unread',
      });
      expect(gmailMock.get).toHaveBeenCalledWith({
        userId: 'me',
        id: mockMessages[0].threadId,
      });
      expect(sendbirdService.sendMessage).toHaveBeenCalledWith(
        'test_channel_url',
        'test_user_id',
        'Test email body',
      );
      expect(configService.set).toHaveBeenCalledWith('thread123', null);
    });

    it('should handle errors during Sendbird message sending', async () => {
      const mockMessages = [{ threadId: 'thread123' }];
      const mockGmailResponse = { data: { messages: mockMessages } };
      const mockGetMessageResponse = { body: 'Test email body' };

      const gmailMock = google.gmail({
        version: 'v1',
        auth: emailService['oAuth2Client'],
      }).users.messages;
      gmailMock.list = jest.fn().mockResolvedValue(mockGmailResponse);
      gmailMock.get = jest.fn().mockResolvedValue(mockGetMessageResponse);

      (configService.get as jest.Mock).mockReturnValue({
        channel: { channel_url: 'test_channel_url' },
        recipient: { user_id: 'test_user_id' },
      });
      (sendbirdService.sendMessage as jest.Mock).mockRejectedValue(
        new Error('Sendbird error'),
      );

      await emailService.receiveEmails();

      expect(emailService['logger'].error).toHaveBeenCalledWith(
        'Error processing reply for thread thread123: Sendbird error',
        undefined,
      );
    });
  });

  describe('getMessage', () => {
    it('should retrieve and process an email message', async () => {
      const mockMessageResponse = {
        data: {
          payload: {
            headers: [
              { name: 'From', value: 'test@example.com' },
              { name: 'Subject', value: 'Test Subject' },
            ],
            parts: [
              {
                mimeType: 'text/plain',
                body: {
                  data: Buffer.from('Test plain text').toString('base64'),
                },
              },
              {
                mimeType: 'text/html',
                body: {
                  data: Buffer.from('Test HTML text').toString('base64'),
                },
              },
              {
                filename: 'test.txt',
                body: { attachmentId: '123' },
              },
            ],
          },
          threadId: 'test_thread_id',
        },
      };
      const mockAttachmentResponse = {
        data: { data: Buffer.from('Test attachment data').toString('base64') },
      };

      const gmailMock = google.gmail({
        version: 'v1',
        auth: emailService['oAuth2Client'],
      }).users.messages;
      gmailMock.get = jest.fn().mockResolvedValue(mockMessageResponse);
      gmailMock.attachments.get = jest
        .fn()
        .mockResolvedValue(mockAttachmentResponse);

      const result = await emailService.getMessage('test_message_id');

      expect(gmailMock.get).toHaveBeenCalledWith({
        userId: 'me',
        id: 'test_message_id',
      });
      expect(gmailMock.attachments.get).toHaveBeenCalledWith({
        userId: 'me',
        messageId: 'test_message_id',
        id: '123',
      });
      expect(result).toEqual({
        messageId: 'test_message_id',
        sender: 'test@example.com',
        subject: 'Test Subject',
        body: 'Test plain text\nTest HTML text',
        attachments: [
          { filename: 'test.txt', data: Buffer.from('Test attachment data') },
        ],
        threadId: 'test_thread_id',
      });
    });
  });

  describe('sendEmail', () => {
    it('should send an email', async () => {
      const mockGmailResponse = { data: { id: 'test_message_id' } };
      const gmailMock = google.gmail({
        version: 'v1',
        auth: emailService['oAuth2Client'],
      }).users.messages;
      gmailMock.send = jest.fn().mockResolvedValue(mockGmailResponse);

      const result = await emailService.sendEmail(
        'test@example.com',
        'Test Subject',
        'Test body',
        [{ filename: 'test.txt', data: Buffer.from('Test data') }],
      );

      expect(gmailMock.send).toHaveBeenCalled();
      expect(result).toEqual(mockGmailResponse.data);
    });
  });

  describe('cleanEmailContent', () => {
    it('should clean email content by removing quotes and divs', () => {
      const html = `
                <div>
                    <div class="gmail_quote">Quote</div>
                    <div>Content</div>
                </div>
            `;
      const result = emailService['cleanEmailContent'](html);
      expect(result).toBe('\nContent');
    });
  });
});
