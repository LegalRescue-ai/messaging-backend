import * as SendBird from 'sendbird';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/dto/create-user.dto';

interface SendbirdUserMetadata {
  role?: UserRole;
  email?: string;
}

@Injectable()
export class SendbirdService {
  private readonly sb: SendBird.SendBirdInstance;
  private readonly logger = new Logger(SendbirdService.name);

  constructor(private configService: ConfigService) {
    this.sb = new SendBird({ appId: this.configService.get<string>('sendbird.appId')! });
  }

  async generateUniqueUserId(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now().toString(36);
    return `${base}_${timestamp}`;
  }

  async createUser(userId: string, name: string, role: UserRole, email: string) {
    return new Promise<SendBird.User>((resolve, reject) => {
      this.sb.connect(userId, (user, error) => {
        if (error) {
          reject(error);
          return;
        }

        this.sb.updateCurrentUserInfo(name, '', (user, error) => {
          if (error) {
            reject(error);
            return;
          }

          // Store metadata with proper typing
          const metadata: SendbirdUserMetadata = { role, email };
          user.metaData = metadata;
          resolve(user);
        });
      });
    });
  }

  async getUserById(userId: string): Promise<SendBird.User> {
    return new Promise((resolve, reject) => {
      this.sb.connect(userId, (user, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(user);
      });
    });
  }

  async createClientAttorneyChannel(clientId: string, attorneyId: string) {
    return new Promise<SendBird.GroupChannel>((resolve, reject) => {
      const params = new this.sb.GroupChannelParams();
      params.addUserIds([clientId, attorneyId]);
      params.isDistinct = true;
      params.name = `Legal Consultation: ${clientId} - ${attorneyId}`;
      
      this.sb.GroupChannel.createChannel(params, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(groupChannel);
      });
    });
  }

  async sendMessage(channelUrl: string, userId: string, message: string, fileUrl?: string) {
    return new Promise<SendBird.UserMessage>((resolve, reject) => {
      this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }

        const params = new this.sb.UserMessageParams();
        params.message = message;
        if (fileUrl) {
          params.data = JSON.stringify({ fileUrl });
        }

        groupChannel.sendUserMessage(params, (userMessage, error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(userMessage);
        });
      });
    });
  }

  async addMessageReaction(channelUrl: string, messageId: number, userId: string, reaction: string) {
    return new Promise<void>((resolve, reject) => {
      this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }

        const query = groupChannel.createPreviousMessageListQuery();
        query.limit = 30;
        query.reverse = true;
        query.load((messages, error) => {
          if (error) {
            reject(error);
            return;
          }

          const message = messages.find(m => m.messageId === messageId);
          if (!message) {
            reject(new Error('Message not found'));
            return;
          }

          groupChannel.addReaction(message, reaction, (reactionEvent, error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      });
    });
  }

  async getMessages(channelUrl: string, messageTimestamp?: number, prevLimit?: number, nextLimit?: number): Promise<SendBird.UserMessage[]> {
    return new Promise((resolve, reject) => {
      this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }

        const query = groupChannel.createPreviousMessageListQuery();
        query.limit = prevLimit || 30;
        query.reverse = true;
        query.load((messages, error) => {
          if (error) {
            reject(error);
            return;
          }
          
          if (messageTimestamp) {
            const filteredMessages = messages.filter(m => m.createdAt >= messageTimestamp);
            resolve(filteredMessages as SendBird.UserMessage[]);
          } else {
            resolve(messages as SendBird.UserMessage[]);
          }
        });
      });
    });
  }

  async uploadFile(buffer: Buffer, fileName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer], { type: 'application/octet-stream' });
      const file = new File([blob], fileName);
      
      // Create a temporary channel for file upload if needed
      const params = new this.sb.GroupChannelParams();
      params.name = 'Temporary Upload Channel';
      
      this.sb.GroupChannel.createChannel(params, (channel, error) => {
        if (error) {
          reject(error);
          return;
        }

        const fileMessageParams = new this.sb.FileMessageParams();
        fileMessageParams.file = file;
        fileMessageParams.fileName = fileName;
        fileMessageParams.mimeType = 'application/octet-stream';

        channel.sendFileMessage(fileMessageParams, (fileMessage: SendBird.FileMessage, error) => {
          if (error) {
            reject(error);
            return;
          }

          // Delete the temporary channel after getting the file URL
          const fileUrl = fileMessage.url || fileMessage.plainUrl;
          if (!fileUrl) {
            reject(new Error('File URL not found in response'));
            return;
          }

          channel.delete(() => {
            resolve(fileUrl);
          });
        });
      });
    });
  }

  async getGroupChannelByUrl(channelUrl: string): Promise<SendBird.GroupChannel> {
    return new Promise((resolve, reject) => {
      this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(groupChannel);
      });
    });
  }

  async getGroupChannelMembers(channelUrl: string): Promise<SendBird.User[]> {
    return new Promise((resolve, reject) => {
      this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
        if (error) {
          reject(error);
          return;
        }

        const query = groupChannel.createMemberListQuery();
        query.limit = 100;
        query.next((members, error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(members);
        });
      });
    });
  }

  async findUserByEmail(email: string): Promise<any> {
    try {
      const query = this.sb.createApplicationUserListQuery();
      query.limit = 1;
      const users = await query.next();
      return users?.find(user => (user.metaData as SendbirdUserMetadata)?.email === email);
    } catch (error) {
      this.logger.error(`Failed to find user by email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getMessage(messageId: string): Promise<any> {
    try {
      const query = this.sb.GroupChannel.createMyGroupChannelListQuery();
      const channels = await query.next();
      
      for (const channel of channels) {
        try {
          const messageQuery = channel.createPreviousMessageListQuery();
          messageQuery.limit = 100;
          messageQuery.reverse = true;
          
          const messages = await new Promise<SendBird.BaseMessageInstance[]>((resolve, reject) => {
            messageQuery.load((messages, error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(messages);
            });
          });
          
          const targetMessage = messages.find(msg => msg.messageId.toString() === messageId);
          if (targetMessage) {
            return {
              ...targetMessage,
              channelUrl: channel.url,
            };
          }
        } catch (error) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to get message: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendFileMessage(
    channelUrl: string,
    userId: string,
    fileUrl: string,
    fileName: string,
  ): Promise<any> {
    try {
      const channel = await this.sb.GroupChannel.getChannel(channelUrl);
      const params = new this.sb.FileMessageParams();
      
      // Create a file object that matches SendBird's requirements
      const file = new File([''], fileName, { type: 'application/octet-stream' });
      params.file = file;
      
      // Add custom data to be used by the app
      params.customType = 'external_file';
      params.data = JSON.stringify({
        url: fileUrl,
        name: fileName
      });
      
      return await new Promise((resolve, reject) => {
        channel.sendFileMessage(params, (message, error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(message);
        });
      });
    } catch (error) {
      this.logger.error(`Failed to send file message: ${error.message}`, error.stack);
      throw error;
    }
  }
}
