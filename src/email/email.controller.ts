import { Controller, Post, Body, UseGuards, Logger, Get, Req, Res } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailService } from './email.service';

@Controller('v1/email')
// @UseGuards(JwtAuthGuard)
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private readonly emailService: EmailService) {}

  @Get('')
  async authorizeGmailApi(
    @Req() req: any,  @Res() res: any 
  ) {
    try {
      const authUrl = await this.emailService.authorizeGmailApi();
      return res.redirect(authUrl);
    } catch (error) {
      this.logger.error(`Error Authorizing admin email address : ${error.message}`, error.stack);
      throw error;
    }
  }
  @Get('/google/callback')
  async getGoogleCallback(
    @Req() req: any,  @Res() res: any 
  ) {
    try {
      const code = req.query.code;
      const response = await this.emailService.getGoogleCallback(code);
      return res.send(response);
    } catch (error) {
      this.logger.error(`Error Authorizing admin email address : ${error.message}`, error.stack);
      throw error;
    }
  }

}
