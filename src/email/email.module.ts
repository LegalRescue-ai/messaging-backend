import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailService } from './email.service';
import { EmailRepliesService } from './email-replies.service';
import { EmailController } from './email.controller';
import { SendbirdModule } from '../sendbird/sendbird.module';
import { EmailGateway } from './email.gateway';

@Module({
  imports: [
    HttpModule.register({
      timeout: 5000,
      maxRedirects: 5,
    }),
    ConfigModule,
    ScheduleModule.forRoot(),
    SendbirdModule,
  ],
  providers: [EmailService, EmailRepliesService, EmailGateway],
  controllers: [EmailController],
  exports: [EmailService, EmailRepliesService],
})
export class EmailModule {}
