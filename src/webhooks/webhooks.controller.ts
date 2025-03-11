import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  @Post('sendbird')
  async handleSendbirdWebhook(
    @Headers('x-sendbird-signature') signature: string,
    @Body() payload: any,
  ) {
    const webhookSecret = this.configService.get<string>('sendbird.webhookSecret');
    
    if (!webhookSecret) {
      throw new Error('Webhook secret is not configured');
    }

    if (!this.webhooksService.verifyWebhookSignature(signature, webhookSecret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return this.webhooksService.handleWebhookEvent(payload, signature);
  }
}
