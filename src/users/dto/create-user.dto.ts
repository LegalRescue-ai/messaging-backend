/* eslint-disable prettier/prettier */
import { IsString, IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum UserRole {
  CLIENT = 'client',
  ATTORNEY = 'attorney',
}

export class UserDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'The full name of the user',
  })
  @IsString()
  name: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'The email address of the user',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.CLIENT,
    description: 'The role of the user (client or attorney)',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({
    example: 'John Doe Law Firms',
    description: 'The user Law Firm Name',
  })

  @IsString()
  @IsNotEmpty()
  id: string


  @IsString()
  @IsOptional()
  lawFirm?: string;
  @IsString()
  profileUrl?: string;


}
