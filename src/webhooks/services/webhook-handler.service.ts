import { Injectable, Logger } from '@nestjs/common';
import { WebhookEvent, WebhookEventType, WebhookProcessingStatus } from '../interfaces/webhook-event.interface';
import { verifySignature } from '../utils/signature.util';

@Injectable()
export class WebhookHandlerService {
  private readonly logger = new Logger(WebhookHandlerService.name);
  private readonly events: Map<string, WebhookEvent> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAYS = [1000, 5000, 15000]; // Exponential backoff

  async handleWebhook(
    payload: any,
    signature: string,
    type: WebhookEventType
  ): Promise<void> {
    try {
      // Verify webhook signature
      const isValid = await verifySignature(payload, signature);
      if (!isValid) {
        throw new Error('Invalid webhook signature');
      }

      const event: WebhookEvent = {
        id: this.generateEventId(),
        type,
        timestamp: new Date(),
        payload,
        signature,
        processingStatus: WebhookProcessingStatus.PENDING,
        retryCount: 0
      };

      this.events.set(event.id, event);
      await this.processWebhookEventWithRetries(event);
    } catch (error) {
      this.logger.error(`Error handling webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async processWebhookEventWithRetries(event: WebhookEvent, attempt: number = 1): Promise<void> {
    try {
      await this.processWebhookEvent(event);
    } catch (error) {
      event.retryCount = attempt;
      
      if (attempt < this.MAX_RETRIES) {
        event.processingStatus = WebhookProcessingStatus.RETRYING;
        event.error = error.message;

        this.logger.warn(
          `Retrying webhook event ${event.id} (attempt ${attempt}/${this.MAX_RETRIES})`
        );

        // Wait for next retry
        return new Promise<void>(resolve => {
          setImmediate(async () => {
            try {
              await this.processWebhookEventWithRetries(event, attempt + 1);
              resolve();
            } catch (retryError) {
              event.processingStatus = WebhookProcessingStatus.FAILED;
              event.error = retryError.message;
              this.logger.error(
                `Webhook event ${event.id} failed after ${this.MAX_RETRIES} retries: ${retryError.message}`
              );
              resolve();
            }
          });
        });
      } else {
        event.processingStatus = WebhookProcessingStatus.FAILED;
        event.error = error.message;
        this.logger.error(
          `Webhook event ${event.id} failed after ${this.MAX_RETRIES} retries: ${error.message}`
        );
      }
    }
  }

  private async processWebhookEvent(event: WebhookEvent): Promise<void> {
    try {
      event.processingStatus = WebhookProcessingStatus.PROCESSING;
      this.logger.log(event);
      switch (event.type) {
        case WebhookEventType.MESSAGE_SENT:
          await this.handleMessageSent(event);
          break;
        case WebhookEventType.FILE_UPLOADED:
          await this.handleFileUploaded(event);
          break;
        case WebhookEventType.EMAIL_DELIVERED:
          await this.handleEmailDelivered(event);
          break;
        default:
          this.logger.warn(`No handler implemented for event type: ${event.type}`);
      }

      event.processingStatus = WebhookProcessingStatus.COMPLETED;
    } catch (error) {
      throw error; // Re-throw to trigger next retry
    }
  }

  private async handleMessageSent(event: WebhookEvent): Promise<void> {
    this.logger.log(`Processing message sent event: ${event.id}`);
    // Implement message sent handling logic
  }

  private async handleFileUploaded(event: WebhookEvent): Promise<void> {
    this.logger.log(`Processing file uploaded event: ${event.id}`);
    // Implement file uploaded handling logic
  }

  private async handleEmailDelivered(event: WebhookEvent): Promise<void> {
    this.logger.log(`Processing email delivered event: ${event.id}`);
    // Implement email delivered handling logic
  }

  private generateEventId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  async getEventStatus(eventId: string): Promise<WebhookEvent | undefined> {
    return this.events.get(eventId);
  }

  async getEventsByType(type: WebhookEventType): Promise<WebhookEvent[]> {
    return Array.from(this.events.values())
      .filter(event => event.type === type);
  }

  async getFailedEvents(): Promise<WebhookEvent[]> {
    return Array.from(this.events.values())
      .filter(event => event.processingStatus === WebhookProcessingStatus.FAILED);
  }
}
