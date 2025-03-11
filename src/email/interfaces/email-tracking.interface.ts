export interface EmailTrackingEvent {
  id: string;
  emailId: string;
  type: EmailEventType;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export enum EmailEventType {
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  SPAM = 'spam',
  UNSUBSCRIBED = 'unsubscribed'
}
