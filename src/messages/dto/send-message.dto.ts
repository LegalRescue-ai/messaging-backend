import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    example: 'group_channel_url',
    description: 'The URL of the Sendbird channel',
  })
  @IsString()
  channelUrl: string;

  @ApiProperty({
    example: 'user-123',
    description: 'The Sendbird user ID of the sender',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    example: 'Hello, how can I help you today?',
    description: 'The message content',
  })
  @IsString()
  message: string;

  @ApiProperty({
    example: 'https://sendbird.com/files/123.pdf',
    description: 'Optional URL of an attached file',
    required: false,
  })
  @IsOptional()
  @IsString()
  fileUrl?: string;
}
