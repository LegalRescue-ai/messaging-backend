import { WebhookEvent } from '../enums/webhook-event.enum';

export interface BaseWebhookPayload {
  category: string;
  type: string;
}

export interface MessageSentPayload extends BaseWebhookPayload {
  sender: {
    userId: string;
    nickname: string;
    metadata?: Record<string, any>;
  };
  channelUrl: string;
  message: string;
  messageId: string;
  url?: string;  // For file messages
  name?: string; // For file messages
}

export interface MessageReadPayload extends BaseWebhookPayload {
  channelUrl: string;
  messageId: string;
  reader: {
    userId: string;
    nickname: string;
  };
}

export interface ReactionAddedPayload extends BaseWebhookPayload {
  messageId: string;
  channelUrl: string;
  reaction: string;
  user: {
    userId: string;
    nickname: string;
  };
}

export interface ReactionRemovedPayload extends BaseWebhookPayload {
  messageId: string;
  channelUrl: string;
  reaction: string;
  user: {
    userId: string;
    nickname: string;
  };
}
