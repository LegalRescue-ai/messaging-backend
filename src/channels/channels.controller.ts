import { Controller, Post, Body } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';

@Controller('channels')
export class ChannelsController {
  constructor(private readonly sendbirdService: SendbirdService) {}

  @Post('create')
  async createChannel(
    @Body() createChannelDto: { clientId: string; attorneyId: string },
  ) {
    const channel = await this.sendbirdService.createClientAttorneyChannel(
      createChannelDto.clientId,
      createChannelDto.attorneyId,
    );
    return channel;
  }
}
