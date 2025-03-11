import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SendbirdService } from './sendbird.service';
import { UserRole } from '../users/enums/user-role.enum';
import * as SendBird from 'sendbird';

jest.mock('sendbird');

describe('SendbirdService', () => {
  let service: SendbirdService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-app-id')
  };

  const mockGroupChannelParams = jest.fn();

  const mockSendBirdInstance = {
    connect: jest.fn(),
    updateCurrentUserInfo: jest.fn(),
    GroupChannel: {
      createChannel: jest.fn(),
      getChannel: jest.fn()
    },
    GroupChannelParams: mockGroupChannelParams,
    UserMessageParams: jest.fn().mockReturnValue({})
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (SendBird as any).mockImplementation(() => mockSendBirdInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendbirdService,
        {
          provide: ConfigService,
          useValue: mockConfigService
        }
      ],
    }).compile();

    service = module.get<SendbirdService>(SendbirdService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateUniqueUserId', () => {
    it('should generate valid user ID from name', async () => {
      const name = 'John Doe';
      const userId = await service.generateUniqueUserId(name);
      
      expect(userId).toMatch(/^johndoe_[a-z0-9]+$/);
    });

    it('should handle special characters in name', async () => {
      const name = 'John@Doe#123';
      const userId = await service.generateUniqueUserId(name);
      
      expect(userId).toMatch(/^johndoe123_[a-z0-9]+$/);
    });
  });

  describe('createUser', () => {
    it('should create user successfully', async () => {
      const userId = 'test-user';
      const name = 'Test User';
      const role = UserRole.CLIENT;
      const email = 'test@example.com';

      const mockUser = {
        userId,
        nickname: name,
        metaData: {}
      };

      mockSendBirdInstance.connect.mockImplementation((_, callback) => 
        callback(mockUser, null)
      );

      mockSendBirdInstance.updateCurrentUserInfo.mockImplementation((_, __, callback) => 
        callback(mockUser, null)
      );

      const result = await service.createUser(userId, name, role, email);

      expect(result).toBeDefined();
      expect(result.userId).toBe(userId);
      expect(result.metaData).toEqual({ role, email });
      expect(mockSendBirdInstance.connect).toHaveBeenCalledWith(userId, expect.any(Function));
      expect(mockSendBirdInstance.updateCurrentUserInfo).toHaveBeenCalledWith(name, '', expect.any(Function));
    });

    it('should handle connection error', async () => {
      const error = new Error('Connection failed');
      mockSendBirdInstance.connect.mockImplementation((_, callback) => 
        callback(null, error)
      );

      await expect(service.createUser('user', 'name', UserRole.CLIENT, 'email'))
        .rejects.toThrow('Connection failed');
    });
  });

  describe('createClientAttorneyChannel', () => {
    it('should create channel successfully', async () => {
      const clientId = 'client-1';
      const attorneyId = 'attorney-1';
      const mockChannel = { url: 'channel-url' };

      const mockParams = {
        addUserIds: jest.fn(),
        isDistinct: false,
        name: ''
      };

      mockGroupChannelParams.mockReturnValue(mockParams);

      mockSendBirdInstance.GroupChannel.createChannel.mockImplementation((params, callback) =>
        callback(mockChannel, null)
      );

      const result = await service.createClientAttorneyChannel(clientId, attorneyId);

      expect(result).toBe(mockChannel);
      expect(mockParams.addUserIds).toHaveBeenCalledWith([clientId, attorneyId]);
      expect(mockParams.isDistinct).toBe(true);
      expect(mockParams.name).toBe(`Legal Consultation: ${clientId} - ${attorneyId}`);
    });

    it('should handle channel creation error', async () => {
      const error = new Error('Channel creation failed');
      mockSendBirdInstance.GroupChannel.createChannel.mockImplementation((_, callback) =>
        callback(null, error)
      );

      await expect(service.createClientAttorneyChannel('client', 'attorney'))
        .rejects.toThrow('Channel creation failed');
    });
  });

  describe('sendMessage', () => {
    const mockChannel = {
      sendUserMessage: jest.fn()
    };

    beforeEach(() => {
      mockSendBirdInstance.GroupChannel.getChannel.mockImplementation((_, callback) =>
        callback(mockChannel, null)
      );
    });

    it('should send text message successfully', async () => {
      const channelUrl = 'channel-1';
      const userId = 'user-1';
      const message = 'Hello';
      const mockMessage = { message };

      mockChannel.sendUserMessage.mockImplementation((params, callback) =>
        callback(mockMessage, null)
      );

      const result = await service.sendMessage(channelUrl, userId, message);

      expect(result).toBe(mockMessage);
      expect(mockSendBirdInstance.GroupChannel.getChannel).toHaveBeenCalledWith(channelUrl, expect.any(Function));
    });

    it('should send message with file URL', async () => {
      const channelUrl = 'channel-1';
      const userId = 'user-1';
      const message = 'Check this file';
      const fileUrl = 'https://example.com/file.pdf';
      const mockMessage = { message, data: JSON.stringify({ fileUrl }) };

      mockChannel.sendUserMessage.mockImplementation((params, callback) =>
        callback(mockMessage, null)
      );

      const result = await service.sendMessage(channelUrl, userId, message, fileUrl);

      expect(result).toBe(mockMessage);
      expect(mockChannel.sendUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message,
          data: JSON.stringify({ fileUrl })
        }),
        expect.any(Function)
      );
    });
  });

  describe('getMessages', () => {
    const mockChannel = {
      createPreviousMessageListQuery: jest.fn()
    };

    const mockQuery = {
      limit: 0,
      reverse: false,
      load: jest.fn()
    };

    beforeEach(() => {
      mockSendBirdInstance.GroupChannel.getChannel.mockImplementation((_, callback) =>
        callback(mockChannel, null)
      );
      mockChannel.createPreviousMessageListQuery.mockReturnValue(mockQuery);
    });

    it('should get messages with default parameters', async () => {
      const channelUrl = 'channel-1';
      const messages = [{ messageId: 1 }, { messageId: 2 }];

      mockQuery.load.mockImplementation(callback => callback(messages, null));

      const result = await service.getMessages(channelUrl);

      expect(result).toEqual(messages);
      expect(mockQuery.limit).toBe(30);
      expect(mockQuery.reverse).toBe(true);
    });

    it('should filter messages by timestamp', async () => {
      const channelUrl = 'channel-1';
      const timestamp = Date.now();
      const messages = [
        { messageId: 1, createdAt: timestamp - 1000 },
        { messageId: 2, createdAt: timestamp + 1000 }
      ];

      mockQuery.load.mockImplementation(callback => callback(messages, null));

      const result = await service.getMessages(channelUrl, timestamp);

      expect(result).toHaveLength(1);
      expect(result[0].messageId).toBe(2);
    });
  });
});
