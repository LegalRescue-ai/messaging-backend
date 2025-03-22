import { Test, TestingModule } from '@nestjs/testing';
import { SendbirdService } from './sendbird.service';
import { ConfigService } from '@nestjs/config';
import * as SendBird from 'sendbird';
import axios from 'axios';
import { UserRole } from '../users/dto/create-user.dto';

jest.mock('sendbird');
jest.mock('axios');

describe('SendbirdService', () => {
  let service: SendbirdService;
  let configService: ConfigService;
  let sendBirdMock: any;
  let groupChannelMock: any;
  let currentUserMock: any;

  beforeEach(async () => {
    sendBirdMock = {
      connect: jest.fn().mockResolvedValue({
         userId: "test_user_id",
         nickname: "test_user",
          profileUrl: "test_profile_url",
          metaData: {role:"test_role", email:"test@gmail.com"},
      }),
      updateCurrentUserInfo: jest.fn().mockImplementation(
        (name, profileUrl, callback) => {
          callback({}, null);
        },
      ),
      currentUser: {
        createMetaData: jest.fn().mockResolvedValue({role:"test_role", email:"test@gmail.com"}),
      },
      GroupChannel: {
        getChannel: jest.fn().mockResolvedValue({channel_url: "test_channel_url"}), 
        createPreviousMessageListQuery: jest.fn(),
        createMemberListQuery: jest.fn(),
        createMyGroupChannelListQuery: jest.fn(),
      },
      UserMessageParams: jest.fn(),
      reconnect: jest.fn().mockResolvedValue(true),
    };

    currentUserMock = {
      createMetaData: jest.fn().mockResolvedValue({role:"test_role", email:"test@gmail.com"  }),
    };

    groupChannelMock = {
      sendUserMessage: jest.fn(),
      createPreviousMessageListQuery: jest.fn(),
      createMemberListQuery: jest.fn().mockImplementation(() => ({
        next: jest.fn(),
        members: [{ userId: 'test_user_id' }],
      })),
      createMyGroupChannelListQuery: jest.fn(),
    };

    (SendBird as any).mockImplementation(() => sendBirdMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SendbirdService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({'test_app_id':{email:"test@gmail.com"}}),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SendbirdService>(SendbirdService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateUniqueUserId', () => {
    it('should generate a unique user ID', async () => {
      const userId = await service.generateUniqueUserId('Test User');
      expect(userId).toMatch(/^testuser_[a-z0-9]+$/);
    });
  });

  describe('createUser', () => {
    it('should create a user', async () => {
      (configService.get as jest.Mock).mockReturnValue('test_app_id');
      sendBirdMock.connect.mockImplementation((userId, callback) => {
        callback({}, null);
      });
      sendBirdMock.updateCurrentUserInfo.mockImplementation(
        (name, profileUrl, callback) => {
          callback({}, null);
        },
      );
      sendBirdMock.currentUser.createMetaData.mockImplementation(() => {});

      const result = await service.createUser(
        'test_user_id',
        'Test User',
        UserRole.CLIENT,
        'test@gmail.com',
      );
      expect(result).toEqual({});
      expect(sendBirdMock.connect).toHaveBeenCalled();
      expect(sendBirdMock.updateCurrentUserInfo).toHaveBeenCalled();
      expect(sendBirdMock.currentUser.createMetaData).toHaveBeenCalledWith({
        role: UserRole.CLIENT,
        email: 'test@gmail.com',
      });
    });

    it('should reject with an error if connect fails', async () => {
      sendBirdMock.connect.mockImplementation((userId, callback) => {
        callback(null, new Error('Connect error'));
      });

      await expect(
        service.createUser(
          'test_user_id',
          'Test User',
          UserRole.CLIENT,
          'test@example.com',
        ),
      ).rejects.toThrow('Connect error');
    });

    it('should reject with an error if updateCurrentUserInfo fails', async () => {
      sendBirdMock.connect.mockImplementation((userId, callback) => {
        callback({}, null);
      });
      sendBirdMock.updateCurrentUserInfo.mockImplementation(
        (name, profileUrl, callback) => {
          callback(null, new Error('Update error'));
        },
      );

      await expect(
        service.createUser(
          'test_user_id',
          'Test User',
          UserRole.CLIENT,
          'test@example.com',
        ),
      ).rejects.toThrow('Update error');
    });
  });

  describe('getCurrentUser', () => {
    it('should return the current user', () => {
      sendBirdMock.currentUser = { id: 'test_user_id' };
      const result = service.getCurrentUser();
      expect(result).toEqual({ id: 'test_user_id' });
    });
  });

  describe('getUserById', () => {
    it('should return user data if found', async () => {
      (configService.get as jest.Mock).mockReturnValue('test_app_id');
      (axios.get as jest.Mock).mockResolvedValue({
        data: { id: 'test_user_id' },
      });

      const result = await service.getUserById('test_user_id');
      expect(result).toEqual({ id: 'test_user_id' });
    });

    it('should return null if user is not found', async () => {
      (configService.get as jest.Mock).mockReturnValue('test_app_id');
      (axios.get as jest.Mock).mockResolvedValue({
        data: { error: true, code: 400201 },
      });

      const result = await service.getUserById('test_user_id');
      expect(result).toBeNull();
    });
  });

  describe('reconnect', () => {
    it('should call Sendbird reconnect', () => {
      service.reconnect();
      expect(sendBirdMock.reconnect).toHaveBeenCalled();
    });
  });

  describe('getUserSessions', () => {
    it('should return the token from axios.post', async () => {
      (configService.get as jest.Mock).mockReturnValue('test_app_id');
      (axios.post as jest.Mock).mockResolvedValue({
        data: { token: 'test_token' },
      });

      const result = await sendBirdMock.getUserSessions('test_user_id');
      expect(result).toEqual('test_token');
    });

    it('should return null if axios.post fails', async () => {
      (configService.get as jest.Mock).mockReturnValue('test_app_id');
      (axios.post as jest.Mock).mockRejectedValue(new Error('Post error'));

      const result = await service.getUserSessions('test_user_id');
      expect(result).toBeNull();
    });
  });

  describe('getUserByEmail', () => {
    it('should return user with access token if successful', async () => {
      sendBirdMock.connect.mockImplementation((name, token, callback) => {
        callback({ id: 'test_user_id' }, null);
      });
      (configService.set as jest.Mock).mockImplementation(() => {});

      const result = await service.getUserByEmail(
        'test_user_id',
        'test@gmail.com',
      );
      expect(result).toContain({ user_id: 'test_user_id' });
    });

    it('should return null if getUserSessions fails', async () => {
      const result = await service.getUserByEmail(
        'test_user_id',
        'test@example.com',
      );
      expect(result).toBeNull();
    });
  });

  describe('sendMessage', () => {
    it('should send a message', async () => {
      sendBirdMock.connect.mockImplementation((userId, token, callback) => {
        callback({}, null);
      });
      sendBirdMock.GroupChannel.getChannel.mockImplementation(
        (channelUrl, callback) => {
          callback(groupChannelMock, null);
        },
      );
      sendBirdMock.UserMessageParams.mockImplementation(() => ({}));
      groupChannelMock.sendUserMessage.mockImplementation(
        (params, callback) => {
          callback({ message: 'test' }, null);
        },
      );

      const result = await service.sendMessage(
        'test_channel_url',
        'test_user_id',
        'test_message',
      );
      expect(result).toEqual({ message: 'test' });
    });
  });

  describe('getGroupChannelMembers', () => {
    it('should return group channel members', async () => {
      sendBirdMock.connect.mockImplementation((userId, token, callback) => {
        callback({}, null);
      });
      sendBirdMock.GroupChannel.getChannel.mockImplementation(
        (channelUrl, callback) => {
          callback(groupChannelMock, null);
        },
      );
      groupChannelMock.createMemberListQuery.mockImplementation(() => ({
        next: jest.fn(),
        members: [{ userId: 'test_user_id' }],
      }));

      const result = await service.getGroupChannelMembers(
        'test_user_id',
        'test_channel_url',
      );
      expect(result).toEqual([{ userId: 'test_user_id' }]);
    });
  });
});
