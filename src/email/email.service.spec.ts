import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import * as emailjs from '@emailjs/nodejs';

jest.mock('@emailjs/nodejs', () => ({
  init: jest.fn(),
  send: jest.fn(),
}));

describe('EmailService', () => {
  let service: EmailService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'EMAILJS_PUBLIC_KEY': 'test_public_key',
                'EMAILJS_PRIVATE_KEY': 'test_private_key',
                'EMAILJS_SERVICE_ID': 'test_service_id',
                'EMAILJS_TEMPLATE_ID': 'test_template_id',
                'EMAILJS_BULK_TEMPLATE_ID': 'test_bulk_template_id',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendMessageNotification', () => {
    it('should send email notification successfully', async () => {
      const mockResponse = { status: 200, text: 'OK' };
      (emailjs.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await service.sendMessageNotification(
        'test@example.com',
        'John Doe',
        'Hello, World!',
        'msg_123',
        [{ url: 'https://example.com/file.pdf', filename: 'document.pdf' }],
      );

      expect(result).toBe(true);
      expect(emailjs.send).toHaveBeenCalledWith(
        'test_service_id',
        'test_template_id',
        {
          to_email: 'test@example.com',
          from_name: 'John Doe',
          message: 'Hello, World!',
          thread_id: 'msg_123',
          attachments: JSON.stringify([
            { url: 'https://example.com/file.pdf', filename: 'document.pdf' },
          ]),
        },
      );
    });

    it('should handle email sending failure', async () => {
      const mockResponse = { status: 400, text: 'Bad Request' };
      (emailjs.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const result = await service.sendMessageNotification(
        'test@example.com',
        'John Doe',
        'Hello, World!',
        'msg_123',
      );

      expect(result).toBe(false);
    });
  });

  describe('sendBulkNotification', () => {
    it('should send bulk email notification successfully', async () => {
      const mockResponse = { status: 200, text: 'OK' };
      (emailjs.send as jest.Mock).mockResolvedValueOnce(mockResponse);

      const recipients = [
        { email: 'user1@example.com', name: 'User 1' },
        { email: 'user2@example.com', name: 'User 2' },
      ];

      const result = await service.sendBulkNotification(
        recipients,
        'Test Subject',
        'Hello, everyone!',
      );

      expect(result).toBe(true);
      expect(emailjs.send).toHaveBeenCalledWith(
        'test_service_id',
        'test_bulk_template_id',
        {
          recipients: JSON.stringify(recipients),
          subject: 'Test Subject',
          message: 'Hello, everyone!',
          attachments: undefined,
        },
      );
    });
  });
});
