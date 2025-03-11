import { Injectable } from '@nestjs/common';
import { SendbirdService } from '../sendbird/sendbird.service';
import { CreateUserDto, UserRole } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly sendbirdService: SendbirdService) {}

  async createUser(createUserDto: CreateUserDto) {
    const { name, email, role } = createUserDto;
    
    // Generate a unique userId based on the name
    const userId = await this.sendbirdService.generateUniqueUserId(name);
    
    // Create user in Sendbird
    const user = await this.sendbirdService.createUser(userId, name, role as UserRole, email);
    
    return {
      userId: user.userId,
      nickname: user.nickname,
      email: (user.metaData as Record<string, string>)?.email,
      role: (user.metaData as Record<string, string>)?.role,
    };
  }
}
