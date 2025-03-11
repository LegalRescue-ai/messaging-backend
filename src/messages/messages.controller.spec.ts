import { Test, TestingModule } from '@nestjs/testing';
import { MessagesController } from './messages.controller';
import { SendbirdService } from '../sendbird/sendbird.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ReactionDto } from './dto/reaction.dto';

describe('MessagesController', () => {
  let controller: MessagesController;
  let sendbirdService: SendbirdService;

  const mockSendbirdService = {
    sendMessage: jest.fn((channelUrl: string, userId: string, message: string, fileUrl?: string) => {
      return Promise.resolve({ messageId: 123, message, fileUrl });
    }),
    getMessages: jest.fn((channelUrl: string, timestamp?: number, prevLimit?: number, nextLimit?: number) => {
      return Promise.resolve([{ messageId: 1, message: 'Test 1' }, { messageId: 2, message: 'Test 2' }]);
    }),
    addMessageReaction: jest.fn((channelUrl: string, messageId: number, userId: string, reaction: string) => {
      return Promise.resolve();
    })
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagesController],
      providers: [
        {
          provide: SendbirdService,
          useValue: mockSendbirdService
        }
      ],
    }).compile();

    controller = module.get<MessagesController>(MessagesController);
    sendbirdService = module.get<SendbirdService>(SendbirdService);
    
    // Clear all mock calls before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('sendMessage', () => {
    it('should send a message successfully', async () => {
      const messageDto: SendMessageDto = {
        channelUrl: 'test-channel',
        message: 'Test message',
        userId: 'test-user'
      };

      const mockMessage = {
        messageId: 123,
        message: messageDto.message,
        fileUrl: undefined
      };

      mockSendbirdService.sendMessage.mockResolvedValueOnce(mockMessage);

      const result = await controller.sendMessage(messageDto);

      expect(result).toBe(mockMessage);
      expect(mockSendbirdService.sendMessage).toHaveBeenCalledWith(
        messageDto.channelUrl,
        messageDto.userId,
        messageDto.message,
        undefined
      );
    });

    it('should handle file attachments', async () => {
      const messageDto: SendMessageDto = {
        channelUrl: 'test-channel',
        message: 'Here is the document',
        userId: 'test-user',
        fileUrl: 'https://example.com/test.pdf'
      };

      const mockMessage = {
        messageId: 123,
        message: messageDto.message,
        fileUrl: messageDto.fileUrl
      };

      mockSendbirdService.sendMessage.mockResolvedValueOnce(mockMessage);

      const result = await controller.sendMessage(messageDto);

      expect(result).toBe(mockMessage);
      expect(mockSendbirdService.sendMessage).toHaveBeenCalledWith(
        messageDto.channelUrl,
        messageDto.userId,
        messageDto.message,
        messageDto.fileUrl
      );
    });
  });

  describe('getMessages', () => {
    it('should get messages successfully', async () => {
      const channelUrl = 'test-channel';
      const mockMessages = [
        { messageId: 1, message: 'Test 1' },
        { messageId: 2, message: 'Test 2' }
      ];

      mockSendbirdService.getMessages.mockResolvedValueOnce(mockMessages);

      const result = await controller.getMessages(channelUrl);

      expect(result).toBe(mockMessages);
      expect(mockSendbirdService.getMessages).toHaveBeenCalledWith(
        channelUrl,
        undefined,
        undefined,
        undefined
      );
    });
  });

  describe('addReaction', () => {
    it('should add reaction successfully', async () => {
      const channelUrl = 'test-channel';
      const reaction: ReactionDto = {
        channelUrl,
        messageId: '123',
        userId: 'test-user',
        reaction: '👍'
      };

      mockSendbirdService.addMessageReaction.mockResolvedValueOnce(undefined);

      await controller.addReaction(reaction);

      expect(mockSendbirdService.addMessageReaction).toHaveBeenCalledWith(
        reaction.channelUrl,
        parseInt(reaction.messageId),
        reaction.userId,
        reaction.reaction
      );
    });
  });
});
