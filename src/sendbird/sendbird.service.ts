/* eslint-disable prettier/prettier */
import * as SendBird from 'sendbird';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../users/dto/create-user.dto';
import axios from 'axios';

interface SendbirdUserMetadata {
  role?: UserRole;
  email?: string;
}

@Injectable()
export class SendbirdService {
  private readonly sb: SendBird.SendBirdInstance;
  private readonly logger = new Logger(SendbirdService.name);

  constructor(private configService: ConfigService) {
    this.sb = new SendBird({ appId: this.configService.get<string>('sendbird.appId')!, });
  }

  async createUser(userId: string, name: string, role: UserRole, email: string, lawFirm?: string, profileUrl?: string) {

    return new Promise<SendBird.User>((resolve, reject) => {
      this.sb.connect(userId, (user, error) => {
        if (error) {
          reject(error);
          return;
        }

        // Update user info with name and profile picture
        this.sb.updateCurrentUserInfo(name, profileUrl || '', (updatedUser, updateError) => {
          if (updateError) {
            reject(updateError);
            return;
          }

          // Store additional metadata - only include lawFirm if provided
          const metadata: any = {
            role,
            email
          };

          if (lawFirm) {
            metadata.lawFirm = lawFirm;
          }

          this.sb.currentUser.createMetaData(metadata, (metaDataResponse, metaDataError) => {
            if (metaDataError) {
              console.log("Meta data error", metaDataError);
              reject(metaDataError);
              return;
            }
            console.log("Meta data response", metaDataResponse);

            resolve(updatedUser);
          });
        });
      });
    });
  }

  async createMetadata(data: { role?: UserRole, email?: string, lawFirm?: string }): Promise<any> {
    return new Promise((resolve, reject) => {
      // Only include lawFirm if provided
      const metadata: any = {};

      if (data.lawFirm) {
        metadata.lawFirm = data.lawFirm;
      }
      if (data.role) {
        metadata.role = data.role;
      }
      if (data.email) {
        metadata.email = data.email;
      }



      this.sb.currentUser.createMetaData(metadata, (metaDataResponse, metaDataError) => {
        if (metaDataError) {
          console.log("Meta data error", metaDataError);
          reject(metaDataError);
          return;
        }


        resolve(metaDataResponse);
      });
    });
  }



  async updateUser(userId: string, updateData: { profileUrl?: string, nickname?: string }): Promise<SendBird.User> {
    let sessionToken = this.configService.get(userId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(userId);
    }

    return new Promise<SendBird.User>((resolve, reject) => {
      this.sb.connect(userId, sessionToken, (user, error) => {
        if (error) {
          reject(error);
          return;
        }

        // Update user info with name and profile picture
        this.sb.updateCurrentUserInfo(
          updateData.nickname || '',
          updateData.profileUrl || '',
          (updatedUser, updateError) => {
            if (updateError) {
              reject(updateError);
              return;
            }

            resolve(updatedUser);
          }
        );
      });
    });
  }


  getCurrentUser() {
    return this.sb.currentUser;
  }

  async getUserById(userId: string): Promise<any> {
    const user = await axios.get(`https://api-${this.configService.get<string>('sendbird.appId')!}.sendbird.com/v3/users/${userId}`, {
      headers: {
        'Api-Token': this.configService.get<string>('sendbird.apiToken')!,
      },
    });
    if (user.data.error === true && (user.data.code === 400201 || user.data.code === 400302)) {
      this.logger.error(`Error getting user by id: ${userId} ${this.configService.get<string>('sendbird.apiToken')}`);
      return null;
    }

    return user.data;
  }

  async reconnect() {
    this.sb.reconnect();
  }

  async getUserInfoById(userId: string): Promise<any> {
    try {
      const response = await axios.get(`https://api-${this.configService.get<string>('sendbird.appId')!}.sendbird.com/v3/users/${userId}`, {
        headers: {
          'Api-Token': this.configService.get<string>('sendbird.apiToken')!,
        },
      });
      return response.data;
    } catch (error) {
      if (error.response &&
        error.response.status === 400 &&
        error.response.data.code === 400201) {
        return null;
      }

      throw error;
    }
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
    let sessionToken = this.configService.get(clientId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(clientId);
    }

    return new Promise<SendBird.GroupChannel>((resolve, reject) => {
      this.sb.connect(clientId, sessionToken, (user, error) => {
        if (error) {
          reject(error);
          return;
        }
        const params = new this.sb.GroupChannelParams();
        params.addUserIds([clientId, attorneyId]);
        params.isDistinct = true;

        this.sb.GroupChannel.createChannel(params, (groupChannel, error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(groupChannel);
        })
      });
    });
  }

  async sendMessage(channelUrl: string, userId: string, message: string, fileUrl?: string) {
    let sessionToken = this.configService.get(userId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(userId);
    }
    return new Promise<SendBird.UserMessage>((resolve, reject) => {
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
        })
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

  async getMessages(channelUrl: string, userId: string, messageTimestamp?: number, prevLimit?: number, nextLimit?: number): Promise<SendBird.UserMessage[]> {
    console.log(nextLimit);
    let sessionToken = this.configService.get(userId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(userId);
    }


    return new Promise((resolve, reject) => {
      // First connect to SendBird
      this.sb.connect(userId, sessionToken, (user, error) => {
        if (error) {
          reject(error);
          return;
        }

        // After successful connection, get the channel
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

  async getGroupChannelMembers(senderId: string, channelUrl: string): Promise<SendBird.User[]> {
    let sessionToken = this.configService.get(senderId)?.accessToken;
    if (!sessionToken) {
      sessionToken = await this.getUserSessions(senderId);
    }
    return new Promise((resolve, reject) => {
      this.sb.connect(
        senderId,
        sessionToken,
        (user, error) => {
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
        },
      );
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
        } catch (error: any) {
          console.log(error)
          continue;
        }
      }

      return null;
    } catch (error) {
      this.logger.error(`Failed to get message: ${error.message}`, error.stack);
      throw error;
    }
  }

  async saveMetaData(channel_type: string, channel_url: string, message_id: string, metadata: any): Promise<any> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const response = await axios.post(
        `https://api-${appId}.sendbird.com/v3/${channel_type}/${channel_url}/messages/${message_id}/sorted_metaarray`,
        {
          sorted_metaarray: metadata,
        },
      );
      if (response.data.error === true && response.data.code === 400301) {
        return response.data;
      }
    }
    catch (error) {
      this.logger.error(`Failed to save metadata: ${error.message}`, error.stack);
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
        this.sb.connect(userId, (user, error) => {
          if (error) {
            reject(error);
            return;
          }
          channel.sendFileMessage(params, (message, error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(message);
          })
        });
      });
    } catch (error) {
      this.logger.error(`Failed to send file message: ${error.message}`, error.stack);
      throw error;
    }
  }
  async getTotalUnreadMessageCount(userId: string): Promise<number> {
    console.log("userId", userId)
    try {
      console.log("userid", userId)
      // Get or create session token
      let sessionToken = this.configService.get(userId)?.accessToken;
      if (!sessionToken) {
        sessionToken = await this.getUserSessions(userId);
      }

      // Connect to SendBird first
      await new Promise<void>((resolve, reject) => {
        this.sb.connect(userId, sessionToken, (user, error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }

        });
      });

      // Use the Promise-based method directly without a callback
      return await this.sb.getTotalUnreadMessageCount();
    } catch (error) {
      this.logger.error(`Failed to get total unread message count: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getTotalChannelMessageCount(channelUrl:string){
    try{
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;
      const response = await axios.get(
        `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/messages/total_count`,
        {
          headers: {
            'Api-Token': apiToken
          }
        }
      )
      const count:{
        "totalCount": {
    "total": number,
    "MESG": number,
    "FILE": number,
    "ADMM": number
  }
      } = response.data
      return count


    }catch(error){
      this.logger.error(`Failed to get total channel message count: ${error.message}`, error.stack)
    }
  }

 

  async createChannelMetadata(
    channelUrl: string,
    key: string,
    value: string,
  ): Promise<any> {
    console.log("creating metadata")
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;

      const metadata = {
        [key]: value
      };

      // Try to update first (in case metadata already exists)
      try {
        const updateResponse = await axios.put(
          `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/metadata`,
          {
            metadata,
            include_ts: true
          },
          {
            headers: {
              'Api-Token': apiToken,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log("response", updateResponse.data)
        return updateResponse.data;
      } catch (updateError) {
        // If update fails, try to create
        const response = await axios.post(
          `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/metadata`,
          {
            metadata,
            include_ts: true
          },
          {
            headers: {
              'Api-Token': apiToken,
              'Content-Type': 'application/json'
            }
          }
        );
        console.log("response", response.data)
        return response.data;
      }
    } catch (error) {
      this.logger.error(`Failed to create/update channel metadata: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateChannelMetadata(
    channelUrl: string,
    key: string,
    value: string,
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;

      const metadata = {
        [key]: value
      };

      const response = await axios.put(
        `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/metadata`,
        {
          metadata,
          include_ts: true
        },
        {
          headers: {
            'Api-Token': apiToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to update channel metadata: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getChannelMetadata(
    channelUrl: string,
    keys?: string[]
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;

      let url = `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/metadata`;

      // Add query parameters if keys are specified
      if (keys && keys.length > 0) {
        const queryParams = keys.map(key => `keys=${encodeURIComponent(key)}`).join('&');
        url += `?${queryParams}`;
      }

      const response = await axios.get(url, {
        headers: {
          'Api-Token': apiToken
        }
      });

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get channel metadata: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getChannelMetadataByKey(
    channelUrl: string,
    key: string
  ): Promise<any> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;

      const response = await axios.get(
        `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}/metadata/${encodeURIComponent(key)}`,
        {
          headers: {
            'Api-Token': apiToken
          }
        }
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Failed to get channel metadata by key: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Find a channel by its email_thread_id metadata
  async findChannelByThreadId(threadId: string): Promise<string | null> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;
      // List all group channels (pagination may be needed for large orgs)
      const response = await axios.get(
        `https://api-${appId}.sendbird.com/v3/group_channels`,
        {
          headers: {
            'Api-Token': apiToken
          }
        }
      );
      const channels = response.data.channels || [];
      for (const channel of channels) {
        if (channel.metadata && channel.metadata.email_thread_id === threadId) {
          return channel.channel_url;
        }
      }
      return null;
    } catch (error) {
      this.logger.error(`Failed to find channel by threadId: ${error.message}`, error.stack);
      return null;
    }
  }

  // Delete a channel by its URL
  async deleteChannel(channelUrl: string): Promise<boolean> {
    try {
      const appId = this.configService.get<string>('sendbird.appId')!;
      const apiToken = this.configService.get<string>('sendbird.apiToken')!;
      
      this.logger.log(`Attempting to delete channel: ${channelUrl}`);
      
      await axios.delete(
        `https://api-${appId}.sendbird.com/v3/group_channels/${channelUrl}`,
        {
          headers: {
            'Api-Token': apiToken
          }
        }
      );
      
      this.logger.log(`Successfully deleted channel: ${channelUrl}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete channel ${channelUrl}: ${error.message}`, error.stack);
      return false;
    }
  }
}
