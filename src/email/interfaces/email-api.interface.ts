export interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType: string;
}

export interface SendEmailRequest {
  to: string;
  subject: string;
  body: string;
  from_name: string;
  attachments?: EmailAttachment[];
}

export interface EmailTrackingResponse {
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  deliveredAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
}

export interface EmailReply {
  from: string;
  reply_body: string;
  thread_id: string;
  attachments?: EmailAttachment[];
  timestamp: Date;
}
