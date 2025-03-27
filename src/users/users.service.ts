/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';
import { UserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly sendbirdService: SendbirdService) {}

  async createUser(createUserDto: UserDto) {
    const { name, email, role, profileUrl, id } = createUserDto;
    console.log("user in user service", createUserDto)

    
    const userId = id;

    // Create user in Sendbird
    const user = await this.sendbirdService.createUser(
      userId,
      name,
      role,
      email,
      profileUrl
    );

    return {
      userId: user.userId,
      nickname: user.nickname,
      email: (user.metaData as Record<string, string>)?.email,
      role: (user.metaData as Record<string, string>)?.role,
    };
  }
}
