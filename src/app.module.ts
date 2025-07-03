import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { MessagesModule } from './messages/messages.module';
import { UsersModule } from './users/users.module';
import { SendbirdModule } from './sendbird/sendbird.module';
import { FilesModule } from './files/files.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { RateLimiterMiddleware } from './common/middleware/rate-limiter.middleware';
import { ChannelsModule } from './channels/channels.module';
import { ContactsModule } from './contacts/contacts.module';
import { EmailModule } from './email/email.module';
import { DynamoModule } from './dynamo/dynamo.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    AuthModule,
    MessagesModule,
    UsersModule,
    SendbirdModule,
    FilesModule,
    WebhooksModule,
    ChannelsModule,
    ContactsModule,
    EmailModule,
    DynamoModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RateLimiterMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
