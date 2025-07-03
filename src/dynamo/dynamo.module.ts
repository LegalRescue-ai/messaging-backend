/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoService } from './dynamo.service';

@Module({
  imports: [ConfigModule],
  providers: [DynamoService],
  exports: [DynamoService],
})
export class DynamoModule { }
