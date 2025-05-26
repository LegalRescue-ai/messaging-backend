/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Param, Query } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';
import { CreateChannelDto, CreateChannelMetadataDto } from './dto/channel.dto';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly sendbirdService: SendbirdService) { }

  @Post('create')
  async createChannel(
    @Body() createChannelDto: CreateChannelDto,
  ) {
    const channel = await this.sendbirdService.createClientAttorneyChannel(
      createChannelDto.clientId,
      createChannelDto.attorneyId,
    );
    return channel;
  }

  @Post('metadata/create')
  async createChannelMetadata(
    @Body() createMetadataDto: CreateChannelMetadataDto,
  ) {
    const metadata = await this.sendbirdService.createChannelMetadata(
      createMetadataDto.channelUrl,
      createMetadataDto.caseId,
      createMetadataDto.fullNames,
    );
    return metadata;
  }

  @Get(':channelUrl/metadata')
  async getChannelMetadata(
    @Param('channelUrl') channelUrl: string,
    @Query('keys') keys?: string,
  ) {
    // Parse comma-separated keys if provided
    const keyArray = keys ? keys.split(',').map(key => key.trim()) : undefined;

    const metadata = await this.sendbirdService.getChannelMetadata(
      channelUrl,
      keyArray
    );
    return metadata;
  }

  @Get(':channelUrl/metadata/:key')
  async getChannelMetadataByKey(
    @Param('channelUrl') channelUrl: string,
    @Param('key') key: string,
  ) {
    const metadata = await this.sendbirdService.getChannelMetadataByKey(
      channelUrl,
      key
    );
    return metadata;
  }
}