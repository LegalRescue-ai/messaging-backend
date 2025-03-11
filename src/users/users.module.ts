import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { SendbirdModule } from '../sendbird/sendbird.module';

@Module({
  imports: [SendbirdModule],
  controllers: [UsersController],
})
export class UsersModule {}
