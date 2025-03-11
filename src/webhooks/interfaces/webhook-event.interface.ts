export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  timestamp: Date;
  payload: any;
  signature?: string;
  processingStatus: WebhookProcessingStatus;
  retryCount?: number;
  error?: string;
}

export enum WebhookEventType {
  // Message events
  MESSAGE_SENT = 'message.sent',
  MESSAGE_UPDATED = 'message.updated',
  MESSAGE_DELETED = 'message.deleted',
  MESSAGE_READ = 'message.read',

  // Channel events
  CHANNEL_CREATED = 'channel.created',
  CHANNEL_UPDATED = 'channel.updated',
  CHANNEL_DELETED = 'channel.deleted',

  // User events
  USER_JOINED = 'user.joined',
  USER_LEFT = 'user.left',
  USER_BANNED = 'user.banned',
  USER_UNBANNED = 'user.unbanned',

  // File events
  FILE_UPLOADED = 'file.uploaded',
  FILE_DELETED = 'file.deleted',

  // Email events
  EMAIL_DELIVERED = 'email.delivered',
  EMAIL_OPENED = 'email.opened',
  EMAIL_CLICKED = 'email.clicked',
  EMAIL_BOUNCED = 'email.bounced',
  EMAIL_SPAM = 'email.spam',
  EMAIL_UNSUBSCRIBED = 'email.unsubscribed',

  // System events
  SYSTEM_ERROR = 'system.error',
  SYSTEM_WARNING = 'system.warning'
}

export enum WebhookProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  RETRYING = 'retrying'
}
