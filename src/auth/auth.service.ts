import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SendbirdService } from '../sendbird/sendbird.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly sendbirdService: SendbirdService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(userId: string): Promise<any> {
    try {
      const user = await this.sendbirdService.getUserById(userId);
      if (user) {
        return user;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async login(user: any) {
    const payload = { sub: user.userId, nickname: user.nickname };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
