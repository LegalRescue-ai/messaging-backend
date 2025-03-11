import { IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiProperty({ enum: ['client', 'attorney'] })
  @IsEnum(['client', 'attorney'])
  role: 'client' | 'attorney';
}
