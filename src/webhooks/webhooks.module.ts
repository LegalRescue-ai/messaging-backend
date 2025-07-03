import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { ConfigModule } from '@nestjs/config';
import { SendbirdModule } from '../sendbird/sendbird.module';
import { EmailModule } from '../email/email.module';
import { HttpModule } from '@nestjs/axios';
import { DynamoService } from 'src/dynamo/dynamo.service';


@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
    SendbirdModule,
    EmailModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, DynamoService],
  exports: [WebhooksService],
})
export class WebhooksModule { }
