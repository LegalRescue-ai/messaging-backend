import * as SendBird from 'sendbird';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/dto/create-user.dto';
import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { Readable } from 'stream';

interface SendbirdUserMetadata {
  role?: UserRole;
  email?: string;
}

@Injectable()
export class SendbirdService {
  private readonly sb: SendBird.SendBirdInstance;
  private readonly logger = new Logger(SendbirdService.name);

  constructor(private configService: ConfigService) {
    this.sb = new SendBird({
      appId: this.configService.get<string>('sendbird.appId')!,
    });
  }

  async generateUniqueUserId(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now().toString(36);
    return `${base}_${timestamp}`;
  }

  async createUser(
    userId: string,
    name: string,
    role: UserRole,
    email: string,
  ) {
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
          this.sb.currentUser.createMetaData({ role, email });
          resolve(user);
        });
      });
    });
  }

  getCurrentUser() {
    return this.sb.currentUser;
  }

  async getUserById(userId: string): Promise<any> {
    const user = await axios.get(
      `https://api-${this.configService.get<string>('sendbird.appId')!}.sendbird.com/v3/users/${userId}`,
      {
        headers: {
          'Api-Token': this.configService.get<string>('sendbird.apiToken')!,
        },
      },
    );
    if (user.data.error === true && user.data.code === 400201) {
      return null;
    }
    return user.data;
  }

  async reconnect() {
    this.sb.reconnect();
  }

  async getUserSessions(userId: string): Promise<any> {
    try {
      const response = await axios.post(
        `https://api-${this.configService.get<string>('sendbird.appId')!}.sendbird.com/v3/users/${userId}/token`,
        {},
        {
          headers: {
            'Api-Token': this.configService.get<string>('sendbird.apiToken')!,
          },
        },
      );
      return response.data.token;
    } catch (error) {
      console.error(
        'Error generating Sendbird session token:',
        error.response ? error.response.data : error.message,
      );
      return null;
    }
  }

  async getUserByEmail(name: string, email: string): Promise<any> {
    try {
      const token = await this.getUserSessions(name);
      if (token) {
        const user = await this.sb.connect(name, token, (user, error) => {
          if (error) {
            return error;
          }
          return user;
        });
        this.configService.set(name, { email, user, token: token });
        return { ...user, accessToken: token };
      }
    } catch (error) {
      console.error(
        'Error generating Sendbird session token:',
        error.response ? error.response.data : error.message,
      );
      return null;
    }
  }

  async createClientAttorneyChannel(clientId: string, attorneyId: string) {
    return new Promise<SendBird.GroupChannel>((resolve, reject) => {
      this.sb.connect(clientId, (user, error) => {
        if (error) {
          reject(error);
          return;
        }
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
    });
  }

  async sendMessage(
    channelUrl: string,
    userId: string,
    message: string,
    files?: { filename: string; data: Buffer }[],
  ) {
    let sessionToken = this.configService.get(userId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(userId);
    }
    return new Promise<
      SendBird.UserMessage | SendBird.FileMessage | SendBird.AdminMessage | void
    >((resolve, reject) => {
      this.sb.connect(userId, sessionToken, (user, error) => {
        if (error) {
          reject(error);
          return;
        }
        this.sb.GroupChannel.getChannel(channelUrl, (groupChannel, error) => {
          if (error) {
            reject(error);
            return;
          }

          const params = new this.sb.UserMessageParams();
          params.message = message ?? 'sent a file';

          if (message) {
            groupChannel.sendUserMessage(params, (userMessage, error) => {
              console.log(userMessage, error);
              if (error) {
                reject(error);
                return;
              }
              resolve(userMessage);
            });
          }
          if (files?.length) {
            this.sendFileMessage('group_channels', channelUrl, userId, files[0].data, files[0].filename)
              .then(() => {
                resolve();
              })
              .catch((error) => {
                this.logger.error(
                  `Failed to send file message: ${error.message}`,
                  error.stack,
                );
                reject(error);
              }
            );
          }
        });
      });
    });
  }

  async sendFileMessage(
    channelType: 'open_channels' | 'group_channels',
    channelUrl: string,
    userId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<void> {
    const url = `https://api-${this.configService.get<string>('sendbird.appId')!}.sendbird.com/v3/${channelType}/${channelUrl}/messages`;
    const headers = {
      'Api-Token': this.configService.get<string>('sendbird.apiToken')!,
    };
    const formData = new FormData();
    formData.append('message_type', 'FILE');
    formData.append('user_id', userId);
    formData.append('file', Readable.from(buffer), {
      filename: fileName,
      contentType: 'application/octet-stream',
    });

    try {
      await axios.post(url, formData, {
        headers: { ...headers, ...formData.getHeaders() },
      });
      // Successful request, no data to return as per instruction.
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Failed to send base64 as file message to Sendbird:`,
        axiosError.response?.data || axiosError.message,
      );
      throw error;
    }
  }

  async addMessageReaction(
    channelUrl: string,
    messageId: number,
    userId: string,
    reaction: string,
  ) {
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

          const message = messages.find((m) => m.messageId === messageId);
          if (!message) {
            reject(new Error('Message not found'));
            return;
          }

          groupChannel.addReaction(
            message,
            reaction,
            (reactionEvent, error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            },
          );
        });
      });
    });
  }

  async getMessages(
    channelUrl: string,
    messageTimestamp?: number,
    prevLimit?: number,
    nextLimit?: number,
  ): Promise<SendBird.UserMessage[]> {
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
            const filteredMessages = messages.filter(
              (m) => m.createdAt >= messageTimestamp,
            );
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

        channel.sendFileMessage(
          fileMessageParams,
          (fileMessage: SendBird.FileMessage, error) => {
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
          },
        );
      });
    });
  }

  async getGroupChannelByUrl(
    channelUrl: string,
  ): Promise<SendBird.GroupChannel> {
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

  async getGroupChannelMembers(
    senderId: string,
    channelUrl: string,
  ): Promise<SendBird.User[]> {
    let sessionToken = this.configService.get(senderId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(senderId);
    }
    return new Promise((resolve, reject) => {
      this.sb.connect(senderId, sessionToken, (user, error) => {
        if (error) {
          reject(error);
          return;
        }
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
    });
  }

  async findUserByEmail(email: string): Promise<any> {
    try {
      const query = this.sb.createApplicationUserListQuery();
      query.limit = 1;
      const users = await query.next();
      return users?.find(
        (user) => (user.metaData as SendbirdUserMetadata)?.email === email,
      );
    } catch (error) {
      this.logger.error(
        `Failed to find user by email: ${error.message}`,
        error.stack,
      );
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

          const messages = await new Promise<SendBird.BaseMessageInstance[]>(
            (resolve, reject) => {
              messageQuery.load((messages, error) => {
                if (error) {
                  reject(error);
                  return;
                }
                resolve(messages);
              });
            },
          );

          const targetMessage = messages.find(
            (msg) => msg.messageId.toString() === messageId,
          );
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

  async saveMetaData(
    channel_type: string,
    channel_url: string,
    message_id: string,
    metadata: any,
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const response = await axios.post(
        `https://https://api-${appId}.sendbird.com/v3/${channel_type}/${channel_url}/messages/${message_id}/sorted_metaarray`,
        {
          sorted_metaarray: metadata,
        },
      );
      if (response.data.error === true && response.data.code === 400301) {
        return response.data;
      }
    } catch (error) {
      this.logger.error(
        `Failed to save metadata: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
