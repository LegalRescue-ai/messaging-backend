import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { ConfigModule } from '@nestjs/config';
import { SendbirdModule } from '../sendbird/sendbird.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    ConfigModule,
    SendbirdModule,
    EmailModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
