import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendbirdService } from '../sendbird/sendbird.service';
import { UserDto } from './dto/create-user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly sendbirdService: SendbirdService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user in Sendbird' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  async registerUser(@Body() createUserDto: UserDto) {
    const sendbirdUserId = await this.sendbirdService.generateUniqueUserId(
      createUserDto.name,
    );
    const user = await this.sendbirdService.createUser(
      sendbirdUserId,
      createUserDto.name,
      createUserDto.role,
      createUserDto.email,
    );

    return {
      sendbirdUserId: user.userId,
      nickname: user.nickname,
      role: createUserDto.role,
      profileUrl: user.profileUrl,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login a user in Sendbird' })
  @ApiResponse({ status: 201, description: 'User successfully logged in' })
  async loginUser(@Body() loginUserDto: UserDto) {
    const emailExists = await this.sendbirdService.getUserByEmail(
     loginUserDto.name, loginUserDto.email); 
    if ( emailExists ) {
      return {
        sendbirdUserId: emailExists.userId,
        nickname: emailExists.nickname,
        role: loginUserDto.role,
        profileUrl: emailExists.profileUrl,
        accessToken: emailExists.accessToken,
      };
    }
    else{
      const user = await this.sendbirdService.createUser(
        loginUserDto.name,
        loginUserDto.name,
        loginUserDto.role,
        loginUserDto.email,
      );
      return {
        sendbirdUserId: user.userId,
        nickname: user.nickname,
        role: loginUserDto.role,
        profileUrl: user.profileUrl,
      };
    }
  }

  @Get(':sendbirdUserId')
  @ApiOperation({ summary: 'Get user details from Sendbird' })
  @ApiResponse({
    status: 200,
    description: 'User details retrieved successfully',
  })
  async getUserDetails(@Param('sendbirdUserId') sendbirdUserId: string) {
    const user = await this.sendbirdService.getUserById(sendbirdUserId);
    if(!user){  
      return {
        message: 'User not found',
      };
    }
    return {
      sendbirdUserId: user.userId,
      nickname: user.nickname,
      profileUrl: user.profileUrl,
      lastSeenAt: user.lastSeenAt,
      isActive: user.isActive,
      metaData: user.metaData,
    };
  }

  @Post('channel')
  async createChannel(
    @Body() { clientId, attorneyId }: { clientId: string; attorneyId: string },
  ) {
    return await this.sendbirdService.createClientAttorneyChannel(
      clientId,
      attorneyId,
    );
  }
}
