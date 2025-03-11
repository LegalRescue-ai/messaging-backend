import { Injectable, Logger } from '@nestjs/common';
import { EmailTrackingEvent, EmailEventType } from '../interfaces/email-tracking.interface';

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);
  private readonly events: Map<string, EmailTrackingEvent[]> = new Map();

  async trackEvent(emailId: string, type: EmailEventType, metadata?: Record<string, any>): Promise<void> {
    const event: EmailTrackingEvent = {
      id: this.generateEventId(),
      emailId,
      type,
      timestamp: new Date(),
      metadata,
    };

    if (!this.events.has(emailId)) {
      this.events.set(emailId, []);
    }
    this.events.get(emailId)!.push(event);

    this.logger.log(`Tracked email event: ${type} for email ${emailId}`);
  }

  async getEmailEvents(emailId: string): Promise<EmailTrackingEvent[]> {
    return this.events.get(emailId) || [];
  }

  async getEmailStats(emailId: string): Promise<Record<EmailEventType, number>> {
    const events = await this.getEmailEvents(emailId);
    const stats = Object.values(EmailEventType).reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<EmailEventType, number>);

    events.forEach(event => {
      stats[event.type]++;
    });

    return stats;
  }

  private generateEventId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }
}
