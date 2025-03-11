import { Module } from '@nestjs/common';
import { MessageHandlerService } from './message-handler.service';
import { SendbirdModule } from '../sendbird/sendbird.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [SendbirdModule, EmailModule],
  providers: [MessageHandlerService],
  exports: [MessageHandlerService],
})
export class MessageModule {}
