import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { SendbirdModule } from '../sendbird/sendbird.module';

@Module({
  imports: [SendbirdModule],
  controllers: [ChannelsController],
})
export class ChannelsModule {}
