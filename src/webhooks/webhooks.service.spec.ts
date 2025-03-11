import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { SendbirdService } from '../sendbird/sendbird.service';
import { WebhookHandlerService } from './services/webhook-handler.service';
import { WebhookEventType } from './interfaces/webhook-event.interface';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import * as signatureUtil from './utils/signature.util';

jest.mock('./utils/signature.util', () => ({
  verifySignature: jest.fn(),
}));

describe('WebhooksService', () => {
  let service: WebhooksService;
  let mockSendbird: Partial<SendbirdService>;
  let mockWebhookHandler: Partial<WebhookHandlerService>;
  let mockConfigService: { get: jest.Mock };
  let mockEmailService: Partial<EmailService>;

  beforeEach(async () => {
    mockSendbird = {
      getMessage: jest.fn(),
      sendMessage: jest.fn(),
      getGroupChannelMembers: jest.fn().mockResolvedValue([]),
    };

    mockWebhookHandler = {
      handleWebhook: jest.fn(),
      getEventsByType: jest.fn(),
      getFailedEvents: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('test-secret'),
    };

    mockEmailService = {
      sendMessageNotification: jest.fn(),
    };

    // Mock signature verification to return true by default
    (signatureUtil.verifySignature as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: SendbirdService,
          useValue: mockSendbird,
        },
        {
          provide: WebhookHandlerService,
          useValue: mockWebhookHandler,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleWebhookEvent', () => {
    const mockPayload = {
      category: 'message',
      type: 'MESG',
      sender: {
        userId: 'user_123',
        nickname: 'Test User'
      },
      channelUrl: 'channel_123',
      message: 'Hello',
      messageId: 'msg_123'
    };

    const mockSignature = 'test-signature';

    it('should handle message events', async () => {
      await service.handleWebhookEvent(mockPayload, mockSignature);

      expect(mockSendbird.getGroupChannelMembers).toHaveBeenCalledWith(mockPayload.channelUrl);
    });

    it('should handle file events', async () => {
      const filePayload = {
        category: 'file',
        type: 'FILE',
        sender: {
          userId: 'user_123',
          nickname: 'Test User'
        },
        channelUrl: 'channel_123',
        url: 'https://example.com/file.pdf',
        name: 'test.pdf',
        messageId: 'msg_123'
      };

      await service.handleWebhookEvent(filePayload, mockSignature);

      expect(mockSendbird.getGroupChannelMembers).toHaveBeenCalledWith(filePayload.channelUrl);
    });

    it('should reject invalid signatures', async () => {
      (signatureUtil.verifySignature as jest.Mock).mockResolvedValue(false);

      await expect(
        service.handleWebhookEvent(mockPayload, 'invalid-signature')
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should handle missing webhook secret', async () => {
      mockConfigService.get.mockReturnValue(null);

      await expect(
        service.handleWebhookEvent(mockPayload, mockSignature)
      ).rejects.toThrow('Invalid webhook signature');
    });
  });
});
