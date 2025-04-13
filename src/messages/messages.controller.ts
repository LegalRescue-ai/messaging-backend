import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendbirdService } from '../sendbird/sendbird.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ReactionDto } from './dto/reaction.dto';

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
  constructor(private readonly sendbirdService: SendbirdService) {}

  @Post('send')
  @ApiOperation({ summary: 'Send a message via Sendbird' })
  @ApiResponse({ status: 201, description: 'Message sent successfully' })
  async sendMessage(@Body() messageDto: SendMessageDto) {
    return await this.sendbirdService.sendMessage(
      messageDto.channelUrl,
      messageDto.userId,
      messageDto.message,
      // messageDto.fileUrl
    );
  }

  @Get(':channelUrl')
  @ApiOperation({ summary: 'Get message history from a channel' })
  @ApiResponse({ status: 200, description: 'Message history retrieved successfully' })
  async getMessages(
    @Param('channelUrl') channelUrl: string,
    @Query('messageTimestamp') messageTimestamp?: number,
    @Query('prevLimit') prevLimit?: number,
    @Query('nextLimit') nextLimit?: number,
  ) {
    return await this.sendbirdService.getMessages(
      channelUrl,
      messageTimestamp,
      prevLimit,
      nextLimit
    );
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
