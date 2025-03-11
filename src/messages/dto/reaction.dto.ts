import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReactionDto {
  @ApiProperty({
    example: 'group_channel_url',
    description: 'The URL of the Sendbird channel',
  })
  @IsString()
  channelUrl: string;

  @ApiProperty({
    example: '123456',
    description: 'The ID of the message to react to',
  })
  @IsString()
  messageId: string;

  @ApiProperty({
    example: 'user-123',
    description: 'The Sendbird user ID of the user adding the reaction',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    example: '👍',
    description: 'The reaction emoji or identifier',
  })
  @IsString()
  reaction: string;
}
