import { Test, TestingModule } from '@nestjs/testing';
import { EmailRepliesService } from './email-replies.service';
import { SendbirdService } from '../sendbird/sendbird.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import * as emailjs from '@emailjs/nodejs';

jest.mock('@emailjs/nodejs', () => ({
  send: jest.fn(),
}));

describe('EmailRepliesService', () => {
  let service: EmailRepliesService;
  let sendbirdService: SendbirdService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailRepliesService,
        {
          provide: SendbirdService,
          useValue: {
            findUserByEmail: jest.fn(),
            getMessage: jest.fn(),
            sendMessage: jest.fn(),
            sendFileMessage: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'EMAILJS_SERVICE_ID': 'test_service_id',
                'EMAILJS_REPLIES_TEMPLATE_ID': 'test_template_id',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EmailRepliesService>(EmailRepliesService);
    sendbirdService = module.get<SendbirdService>(SendbirdService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processReply', () => {
    it('should process text reply successfully', async () => {
      const mockUser = { userId: 'user123' };
      const mockMessage = { channelUrl: 'channel123' };

      (sendbirdService.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (sendbirdService.getMessage as jest.Mock).mockResolvedValue(mockMessage);
      (sendbirdService.sendMessage as jest.Mock).mockResolvedValue({});

      await service.processReply(
        'test@example.com',
        'Test reply',
        'msg_123',
      );

      expect(sendbirdService.findUserByEmail).toHaveBeenCalledWith('test@example.com');
      expect(sendbirdService.getMessage).toHaveBeenCalledWith('msg_123');
      expect(sendbirdService.sendMessage).toHaveBeenCalledWith(
        'channel123',
        'user123',
        'Test reply',
      );
    });

    it('should process reply with attachments', async () => {
      const mockUser = { userId: 'user123' };
      const mockMessage = { channelUrl: 'channel123' };
      const attachments = [
        { url: 'https://example.com/file.pdf', filename: 'document.pdf' },
      ];

      (sendbirdService.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (sendbirdService.getMessage as jest.Mock).mockResolvedValue(mockMessage);
      (sendbirdService.sendFileMessage as jest.Mock).mockResolvedValue({});
      (sendbirdService.sendMessage as jest.Mock).mockResolvedValue({});

      await service.processReply(
        'test@example.com',
        'Test reply',
        'msg_123',
        attachments,
      );

      expect(sendbirdService.sendFileMessage).toHaveBeenCalledWith(
        'channel123',
        'user123',
        'https://example.com/file.pdf',
        'document.pdf',
      );
      expect(sendbirdService.sendMessage).toHaveBeenCalledWith(
        'channel123',
        'user123',
        'Test reply',
      );
    });

    it('should throw NotFoundException when user not found', async () => {
      (sendbirdService.findUserByEmail as jest.Mock).mockResolvedValue(null);

      await expect(
        service.processReply('test@example.com', 'Test reply', 'msg_123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when message not found', async () => {
      const mockUser = { userId: 'user123' };
      (sendbirdService.findUserByEmail as jest.Mock).mockResolvedValue(mockUser);
      (sendbirdService.getMessage as jest.Mock).mockResolvedValue(null);

      await expect(
        service.processReply('test@example.com', 'Test reply', 'msg_123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkForNewReplies', () => {
    it('should process new replies successfully', async () => {
      const mockReplies = [
        {
          from: 'test@example.com',
          reply_body: 'Test reply',
          thread_id: 'msg_123',
        },
      ];

      (emailjs.send as jest.Mock).mockResolvedValue({
        status: 200,
        text: JSON.stringify(mockReplies),
      });

      const processReplySpy = jest.spyOn(service, 'processReply');
      processReplySpy.mockResolvedValue();

      await service.checkForNewReplies();

      expect(emailjs.send).toHaveBeenCalled();
      expect(processReplySpy).toHaveBeenCalledWith(
        'test@example.com',
        'Test reply',
        'msg_123',
        undefined,
      );
    });

    it('should handle errors gracefully', async () => {
      (emailjs.send as jest.Mock).mockRejectedValue(new Error('API Error'));

      await expect(service.checkForNewReplies()).resolves.not.toThrow();
    });
  });
});
