export interface Contact {
  id: string;
  email: string;
  name: string;
  sendbirdUserId: string;
  role: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
