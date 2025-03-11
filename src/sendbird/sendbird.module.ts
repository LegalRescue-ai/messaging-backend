import { Module, Global } from '@nestjs/common';
import { SendbirdService } from './sendbird.service';

@Global()
@Module({
  providers: [SendbirdService],
  exports: [SendbirdService],
})
export class SendbirdModule {}
