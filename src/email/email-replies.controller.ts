import { Controller, Post, Body, UseGuards, Logger } from '@nestjs/common';
import { EmailRepliesService } from './email-replies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('v1/email')
@UseGuards(JwtAuthGuard)
export class EmailRepliesController {
  private readonly logger = new Logger(EmailRepliesController.name);

  constructor(private readonly emailRepliesService: EmailRepliesService) {}

  @Post('replies')
  async handleEmailReply(
    @Body()
    replyData: {
      from: string;
      reply_body: string;
      thread_id: string;
      subject?: string;
      attachments?: Array<{ url: string; filename: string }>;
    },
  ) {
    try {
      await this.emailRepliesService.processReply(
        replyData.from,
        replyData.reply_body,
        replyData.thread_id,
        replyData.attachments,
      );

      return { success: true, message: 'Reply processed successfully' };
    } catch (error) {
      this.logger.error(`Error processing email reply: ${error.message}`, error.stack);
      throw error;
    }
  }
}
