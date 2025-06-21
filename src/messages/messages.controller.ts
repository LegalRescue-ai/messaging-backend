/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendbirdService } from '../sendbird/sendbird.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ReactionDto } from './dto/reaction.dto';

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly sendbirdService: SendbirdService) { }




  @Post('send')
  @ApiOperation({ summary: 'Send a message via Sendbird' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  async sendMessage(@Body() messageDto: SendMessageDto) {
    return await this.sendbirdService.sendMessage(
      messageDto.channelUrl,
      messageDto.userId,
      messageDto.message,
      messageDto.fileUrl
    );
  }
  

  @Get('unread/:userId')
  @ApiOperation({ summary: 'Get total unread message count for a user across all channels' })
  @ApiResponse({ status: 200, description: 'Unread message count retrieved successfully' })
  async getUnreadMessageCount(@Param('userId') userId: string) {
    const count = await this.sendbirdService.getTotalUnreadMessageCount(userId);
    return { unreadCount: count };
  }

  @Get(':channelUrl/:userId')
  @ApiOperation({ summary: 'Get message history from a channel' })
  @ApiResponse({ status: 200, description: 'Message history retrieved successfully' })
  async getMessages(
    @Param('channelUrl') channelUrl: string,
    @Param('userId') userId: string,
    @Query('messageTimestamp') messageTimestamp?: number,
    @Query('prevLimit') prevLimit?: number,
    @Query('nextLimit') nextLimit?: number,
  ) {
    console.log("calling this api for testing")
    return await this.sendbirdService.getMessages(
      channelUrl,
      userId,
      messageTimestamp,
      prevLimit,
      nextLimit
    );
  }
    
  @Get('/channel/total-count/:channelUrl')
  @ApiOperation({summary:"Get total message count for a channel"})
  @ApiResponse({status:200, description:'Total message count retrived successfully'})
  async getTotalChannelMessageCount(@Param('channelUrl') channelUrl:string){
    const count = await this.sendbirdService.getTotalChannelMessageCount(channelUrl)
    return count
  }

  @Post('react')
  @ApiOperation({ summary: 'Add a reaction to a message' })
  @ApiResponse({ status: 201, description: 'Reaction added successfully' })
  async addReaction(@Body() reactionDto: ReactionDto) {
    await this.sendbirdService.addMessageReaction(
      reactionDto.channelUrl,
      parseInt(reactionDto.messageId, 10),
      reactionDto.userId,
      reactionDto.reaction
    );
    return { success: true };
  }

}
