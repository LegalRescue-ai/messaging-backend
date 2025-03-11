import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fileUrl?: string;
}

export class MessageReactionDto {
  @ApiProperty()
  @IsString()
  messageId: string;

  @ApiProperty()
  @IsString()
  reaction: string;
}
