/* eslint-disable prettier/prettier */
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
    const sendbirdUserId = createUserDto.id;
    const user = await this.sendbirdService.createUser(
      sendbirdUserId,
      createUserDto.name,
      createUserDto.role,
      createUserDto.email,
      createUserDto.profileUrl,
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
  console.log("user in controller", loginUserDto);
  
  const user = await this.sendbirdService.getUserInfoById(loginUserDto.id);
  
  if (user) {
    if ((!user.profileUrl || user.profileUrl === '' || user.profileUrl !== loginUserDto.profileUrl) && loginUserDto.profileUrl) {
      console.log("Updating user profile URL:", loginUserDto.profileUrl);
      const updatedUser = await this.sendbirdService.updateUser(
        loginUserDto.id,
        {
          profileUrl: loginUserDto.profileUrl
        }
      );
      
      // Return updated user info
      return {
        sendbirdUserId: updatedUser.userId,
        nickname: updatedUser.nickname,
        role: loginUserDto.role,
        profileUrl: updatedUser.profileUrl,
        
      };
    }
    
    // Return existing user info if no update needed
    return {
      sendbirdUserId: user.userId,
      nickname: user.nickname,
      role: loginUserDto.role,
      profileUrl: user.profileUrl,
      accessToken: user.accessToken,
    };
  } else {
    // Create new user if doesn't exist
    const newUser = await this.sendbirdService.createUser(
      loginUserDto.id,
      loginUserDto.name,
      loginUserDto.role,
      loginUserDto.email,
      loginUserDto.profileUrl,
    );
    
    return {
      sendbirdUserId: newUser.userId,
      nickname: newUser.nickname,
      role: loginUserDto.role,
      profileUrl: newUser.profileUrl,
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
