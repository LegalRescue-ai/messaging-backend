/* eslint-disable prettier/prettier */
import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendbirdService } from '../sendbird/sendbird.service';
import { UserDto, UserRole } from './dto/create-user.dto';
import { ConfigService } from '@nestjs/config';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly sendbirdService: SendbirdService,
    private configService: ConfigService
  ) { }

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
      createUserDto.lawFirm,
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
  @Post('login')
  @ApiOperation({ summary: 'Login a user in Sendbird' })
  @ApiResponse({ status: 201, description: 'User successfully logged in' })
  async loginUser(@Body() loginUserDto: UserDto) {

    const user = await this.sendbirdService.getUserInfoById(loginUserDto.id);

    console.log("debugging user", user);

    if (user) {
      let sessionToken = this.configService.get(loginUserDto.id)?.accessToken;
      if (!sessionToken) {
        sessionToken = await this.sendbirdService.getUserSessions(loginUserDto.id);
      }

      // Check if profile URL needs updating
      if ((!user.profileUrl || user.profileUrl === '' || user.profileUrl !== loginUserDto.profileUrl) && loginUserDto.profileUrl) {
        console.log("Updating user profile URL:", loginUserDto.profileUrl);
        const updatedUser = await this.sendbirdService.updateUser(
          loginUserDto.id,
          {
            profileUrl: loginUserDto.profileUrl
          }
        );

        // Check if user already has required metadata
        const hasEmail = user.metadata && user.metadata.email;
        const hasRole = user.metadata && user.metadata.role;
        const hasLawFirm = user.metadata && user.metadata.lawFirm;

        // For attorneys, check if lawFirm is also present
        const isAttorney = loginUserDto.role === UserRole.ATTORNEY;
        const hasRequiredMetadata = hasEmail && hasRole && (!isAttorney || hasLawFirm);

        if (!hasRequiredMetadata) {
          console.log("Adding missing metadata for user:", loginUserDto.id);

          // Only create metadata for fields that don't exist yet
          const missingMetadata: any = {};
          if (!hasEmail && loginUserDto.email) {
            missingMetadata.email = loginUserDto.email;
          }
          if (!hasRole && loginUserDto.role) {
            missingMetadata.role = loginUserDto.role;
          }
          if (isAttorney && !hasLawFirm && loginUserDto.lawFirm) {
            missingMetadata.lawFirm = loginUserDto.lawFirm;
          }

          // Only call createMetadata if there are actually missing fields to add
          if (Object.keys(missingMetadata).length > 0) {
            console.log("Missing metadata fields:", Object.keys(missingMetadata));
            await this.sendbirdService.createMetadata(
              missingMetadata
            );
          }
        } else {
          console.log("User already has all required metadata, skipping creation");
        }

        // Return updated user info
        return {
          sendbirdUserId: updatedUser.userId,
          nickname: updatedUser.nickname,
          role: loginUserDto.role,
          profileUrl: updatedUser.profileUrl,
          accessToken: sessionToken
        };
      }

      // Return existing user info if no update needed
      return {
        sendbirdUserId: user.userId,
        nickname: user.nickname,
        role: loginUserDto.role,
        profileUrl: user.profileUrl,
        accessToken: sessionToken,
      };
    } else {
      // Create new user if doesn't exist
      const newUser = await this.sendbirdService.createUser(
        loginUserDto.id,
        loginUserDto.name,
        loginUserDto.role,
        loginUserDto.email,
        loginUserDto.lawFirm,
        loginUserDto.profileUrl,
      );
      let sessionToken = this.configService.get(newUser.userId)?.accessToken;
      if (!sessionToken) {
        sessionToken = await this.sendbirdService.getUserSessions(newUser.userId);
      }

      return {
        sendbirdUserId: newUser.userId,
        nickname: newUser.nickname,
        role: loginUserDto.role,
        profileUrl: newUser.profileUrl,
        accessToken: sessionToken
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
    if (!user) {
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
