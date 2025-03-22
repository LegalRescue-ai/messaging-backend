import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import axios from 'axios';
import { verifySignature } from './utils/signature.util';
import { Logger } from '@nestjs/common';
import { SendbirdService } from 'src/sendbird/sendbird.service';

jest.mock('axios');
jest.mock('./utils/signature.util', () => ({
  verifySignature: jest.fn(),
}));

describe('WebhooksService', () => {
  let webhooksService: WebhooksService;
  let configService: ConfigService;
  let sendbirdService: SendbirdService;
  let emailService: EmailService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('secret'), 
            set: jest.fn(),
          },
        },
        {
          provide: SendbirdService,
          useValue: {
            getGroupChannelMembers: jest.fn(),
            getUserById: jest.fn().mockResolvedValue({ metadata: { email: 'test@gmail.com'},userId:"test_user_id" }),
            getUserSessions: jest.fn().mockResolvedValue({token:"session_token"}),
            getCurrentUser: jest.fn().mockResolvedValue({metadata:{email:"test@gmail.com", userId:"test_user_id", role:"test_role"}}),
            reconnect: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn().mockResolvedValue({threadId:"thread_id"}),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
          },
        },
      ],
    }).compile();

    webhooksService = module.get<WebhooksService>(WebhooksService);
    configService = module.get<ConfigService>(ConfigService);
    sendbirdService = module.get<SendbirdService>(SendbirdService);
    emailService = module.get<EmailService>(EmailService);
    logger = module.get<Logger>(Logger);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(webhooksService).toBeDefined();
  });

  describe('handleWebhookEvent', () => {
    it('should handle group_channel:message_send event', async () => {
      const payload = {
        category: 'group_channel:message_send',
        channel: { channel_url: 'test_url' },
        payload: { message: 'test' },
        sender: { user_id: 'sender_id', nickname: 'sender_nick' },
        type: 'MESG',
        url: null,
      };
      (configService.get as jest.Mock).mockReturnValue('secret');
      (verifySignature as jest.Mock).mockReturnValue(true);
      (sendbirdService.getGroupChannelMembers as jest.Mock).mockResolvedValue([
        { userId: 'recipient_id' },
      ]);
      (sendbirdService.getUserById as jest.Mock).mockResolvedValue({
        metadata: { email: 'test@example.com' },
      });
      (sendbirdService.getUserSessions as jest.Mock).mockResolvedValue(
        'session_token',
      );
      (emailService.sendEmail as jest.Mock).mockResolvedValue({
        threadId: 'thread_id',
      });

      const result = await webhooksService.handleWebhookEvent(
        payload,
        'signature',
      );
      expect(result).toEqual({ success: true });
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('should handle group_channel:file event', async () => {
      const payload = {
        category: 'group_channel:file',
        channel: { channel_url: 'test_url' },
        payload: { url: 'file_url' },
        sender: { user_id: 'sender_id', nickname: 'sender_nick' },
        type: 'FILE',
        url: 'file_url',
      };
      (configService.get as jest.Mock).mockReturnValue('secret');
      (verifySignature as jest.Mock).mockReturnValue(true);
      (sendbirdService.getGroupChannelMembers as jest.Mock).mockResolvedValue([
        { userId: 'recipient_id' },
      ]);
      (sendbirdService.getUserById as jest.Mock).mockResolvedValue({
        metadata: { email: 'test@example.com' },
      });
      (sendbirdService.getUserSessions as jest.Mock).mockResolvedValue(
        'session_token',
      );
      (emailService.sendEmail as jest.Mock).mockResolvedValue({
        threadId: 'thread_id',
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: Buffer.from('test_image_data'),
      });

      const result = await webhooksService.handleWebhookEvent(
        payload,
        'signature',
      );
      expect(result).toEqual({ success: true });
      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('should handle unhandled event category', async () => {
      const payload = { category: 'unknown_category' };
      (configService.get as jest.Mock).mockReturnValue('secret');
      (verifySignature as jest.Mock).mockReturnValue(true);

      const result = await webhooksService.handleWebhookEvent(
        payload,
        'signature',
      );
      expect(result).toEqual({
        success: false,
        message: 'Unhandled event category',
      });
    });

    it('should throw error on invalid signature', async () => {
      const payload = { category: 'group_channel:message_send' };
      (configService.get as jest.Mock).mockReturnValue('secret');
      (verifySignature as jest.Mock).mockReturnValue(false);

      await expect(
        webhooksService.handleWebhookEvent(payload, 'signature'),
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should throw error on missing webhook secret', async () => {
      const payload = { category: 'group_channel:message_send' };
      (configService.get as jest.Mock).mockReturnValue(null);

      await expect(
        webhooksService.handleWebhookEvent(payload, 'signature'),
      ).rejects.toThrow('Webhook secret not configured');
    });

    it('should handle sendbird reconnect on sendbird error', async () => {
      const payload = {
        category: 'group_channel:message_send',
        channel: { channel_url: 'test_url' },
        payload: { message: 'test' },
        sender: { user_id: 'sender_id', nickname: 'sender_nick' },
        type: 'MESG',
        url: null,
      };
      (configService.get as jest.Mock).mockReturnValue('secret');
      (verifySignature as jest.Mock).mockReturnValue(true);
      (sendbirdService.getGroupChannelMembers as jest.Mock).mockRejectedValue({
        code: 400300,
      });

      await webhooksService.handleWebhookEvent(payload, 'signature');
      expect(sendbirdService.reconnect).toHaveBeenCalled();
    });
  });
});
