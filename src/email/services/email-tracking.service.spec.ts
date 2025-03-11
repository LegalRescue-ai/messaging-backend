import { Test, TestingModule } from '@nestjs/testing';
import { EmailTrackingService } from './email-tracking.service';
import { EmailEventType } from '../interfaces/email-tracking.interface';

describe('EmailTrackingService', () => {
  let service: EmailTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTrackingService],
    }).compile();

    service = module.get(EmailTrackingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('trackEvent', () => {
    it('should track a new email event', async () => {
      const emailId = 'test-email-123';
      const type = EmailEventType.SENT;
      const metadata = { recipient: 'test@example.com' };

      await service.trackEvent(emailId, type, metadata);
      const events = await service.getEmailEvents(emailId);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        emailId,
        type,
        metadata,
      });
    });

    it('should track multiple events for the same email', async () => {
      const emailId = 'test-email-123';
      
      await service.trackEvent(emailId, EmailEventType.SENT);
      await service.trackEvent(emailId, EmailEventType.DELIVERED);
      await service.trackEvent(emailId, EmailEventType.OPENED);

      const events = await service.getEmailEvents(emailId);
      expect(events).toHaveLength(3);
    });
  });

  describe('getEmailStats', () => {
    it('should return correct stats for email events', async () => {
      const emailId = 'test-email-123';
      
      await service.trackEvent(emailId, EmailEventType.SENT);
      await service.trackEvent(emailId, EmailEventType.DELIVERED);
      await service.trackEvent(emailId, EmailEventType.OPENED);
      await service.trackEvent(emailId, EmailEventType.OPENED);
      await service.trackEvent(emailId, EmailEventType.CLICKED);

      const stats = await service.getEmailStats(emailId);

      expect(stats).toMatchObject({
        [EmailEventType.SENT]: 1,
        [EmailEventType.DELIVERED]: 1,
        [EmailEventType.OPENED]: 2,
        [EmailEventType.CLICKED]: 1,
      });
    });

    it('should return zero counts for unused event types', async () => {
      const emailId = 'test-email-123';
      await service.trackEvent(emailId, EmailEventType.SENT);

      const stats = await service.getEmailStats(emailId);
      expect(stats[EmailEventType.BOUNCED]).toBe(0);
      expect(stats[EmailEventType.SPAM]).toBe(0);
    });
  });
});
