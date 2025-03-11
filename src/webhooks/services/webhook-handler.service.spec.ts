import { Test, TestingModule } from '@nestjs/testing';
import { WebhookHandlerService } from './webhook-handler.service';
import { WebhookEvent, WebhookEventType, WebhookProcessingStatus } from '../interfaces/webhook-event.interface';
import * as signatureUtil from '../utils/signature.util';
import { ConfigService } from '@nestjs/config';

jest.mock('../utils/signature.util', () => ({
  verifySignature: jest.fn(),
}));

describe('WebhookHandlerService', () => {
  let service: WebhookHandlerService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebhookHandlerService();
    
    // Mock signature verification by default
    (signatureUtil.verifySignature as jest.Mock).mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleWebhook', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      console.log('Test starting with fake timers');
    });

    afterEach(() => {
      jest.useRealTimers();
      console.log('Test cleanup - resetting timers');
    });

    it('should process a valid webhook', async () => {
      // Mock processWebhookEvent to succeed
      jest.spyOn(service as any, 'processWebhookEvent').mockImplementation(async (event: WebhookEvent) => {
        event.processingStatus = WebhookProcessingStatus.COMPLETED;
      });

      const event = await service.handleWebhook({ message: 'test' }, 'test-signature', WebhookEventType.MESSAGE_SENT);
      
      const events = await service.getEventsByType(WebhookEventType.MESSAGE_SENT);
      console.log(`After processing - Event count: ${events.length}, Status: ${events[0]?.processingStatus}`);
      expect(events).toHaveLength(1);
      expect(events[0].processingStatus).toBe(WebhookProcessingStatus.COMPLETED);
    });

    it('should reject invalid signatures', async () => {
      // Mock signature verification to fail
      (signatureUtil.verifySignature as jest.Mock).mockResolvedValue(false);

      await expect(
        service.handleWebhook({ message: 'test' }, 'test-signature', WebhookEventType.MESSAGE_SENT)
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('should handle processing errors with retries', async () => {
      jest.useFakeTimers();
      let attempts = 0;
      let processedEvent: WebhookEvent | undefined;
      
      // Mock the processWebhookEvent to fail twice then succeed
      const mockProcessWebhookEvent = jest.spyOn(service as any, 'processWebhookEvent')
        .mockImplementation(async (e: WebhookEvent) => {
          processedEvent = e;
          attempts++;
          console.log(`Processing attempt ${attempts}, current event status: ${processedEvent.processingStatus}`);
          if (attempts <= 2) {
            const error = new Error(`Processing failed attempt ${attempts}`);
            console.log(`Attempt ${attempts} failed, updating status to RETRYING`);
            throw error;
          }
          processedEvent.processingStatus = WebhookProcessingStatus.COMPLETED;
          return Promise.resolve();
        });

      const mockPayload = { message: 'test' };
      const mockSignature = 'test-signature';
      
      const promise = service.handleWebhook(mockPayload, mockSignature, WebhookEventType.MESSAGE_SENT);
      
      // Fast-forward all timers and wait for promises to resolve
      for (let i = 1; i <= 2; i++) {
        await jest.advanceTimersByTimeAsync(Math.pow(2, i) * 500);
      }
      
      await promise;
      
      expect(mockProcessWebhookEvent).toHaveBeenCalledTimes(3);
      expect(processedEvent).toBeDefined();
      expect(processedEvent!.processingStatus).toBe(WebhookProcessingStatus.COMPLETED);
      expect(processedEvent!.retryCount).toBe(2);
    }, 120000);

    it('should mark event as failed after max retries', async () => {
      jest.useFakeTimers();
      let attempts = 0;
      let processedEvent: WebhookEvent | undefined;
      
      // Mock the processWebhookEvent to always fail
      const mockProcessWebhookEvent = jest.spyOn(service as any, 'processWebhookEvent')
        .mockImplementation(async (e: WebhookEvent) => {
          processedEvent = e;
          attempts++;
          if (attempts > 3) {
            return;
          }
          console.log(`Event failed, attempt ${attempts}`);
          throw new Error(`Processing failed attempt ${attempts}`);
        });

      const mockPayload = { message: 'test' };
      const mockSignature = 'test-signature';
      
      const promise = service.handleWebhook(mockPayload, mockSignature, WebhookEventType.MESSAGE_SENT);
      
      // Fast-forward all timers and wait for promises to resolve
      for (let i = 1; i <= 3; i++) {
        await jest.advanceTimersByTimeAsync(Math.pow(2, i) * 500);
      }
      
      await promise;
      
      expect(mockProcessWebhookEvent).toHaveBeenCalledTimes(3);
      expect(processedEvent).toBeDefined();
      expect(processedEvent!.processingStatus).toBe(WebhookProcessingStatus.FAILED);
      expect(processedEvent!.retryCount).toBe(3);
    }, 120000);
  });

  describe('Event querying', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should get events by type', async () => {
      const mockPayload = { message: 'test' };
      const mockSignature = 'test-signature';

      // Create test events
      await service.handleWebhook(mockPayload, mockSignature, WebhookEventType.MESSAGE_SENT);
      await service.handleWebhook(mockPayload, mockSignature, WebhookEventType.FILE_UPLOADED);

      const messageEvents = await service.getEventsByType(WebhookEventType.MESSAGE_SENT);
      const fileEvents = await service.getEventsByType(WebhookEventType.FILE_UPLOADED);

      console.log(`Events by type - MESSAGE_SENT: ${messageEvents.length}, FILE_UPLOADED: ${fileEvents.length}`);
      
      expect(messageEvents).toHaveLength(1);
      expect(fileEvents).toHaveLength(1);
    });

    it('should get failed events', async () => {
      jest.useFakeTimers();
      const mockPayload = { message: 'test' };
      const mockSignature = 'test-signature';
      let processedEvent: WebhookEvent | undefined;
      
      // Mock processWebhookEvent to fail
      jest.spyOn(service as any, 'processWebhookEvent').mockImplementation(async (e: WebhookEvent) => {
        processedEvent = e;
        throw new Error('Processing failed');
      });
      
      const promise = service.handleWebhook(mockPayload, mockSignature, WebhookEventType.MESSAGE_SENT);
      
      // Fast-forward all timers and wait for promises to resolve
      for (let i = 1; i <= 3; i++) {
        await jest.advanceTimersByTimeAsync(Math.pow(2, i) * 500);
      }
      
      await promise;
      
      const failedEvents = await service.getFailedEvents();
      expect(processedEvent).toBeDefined();
      expect(failedEvents).toContainEqual(expect.objectContaining({
        id: processedEvent!.id,
        processingStatus: WebhookProcessingStatus.FAILED
      }));
    }, 120000);
  });

  describe('Retry mechanism', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should retry failed events with exponential backoff', async () => {
      jest.useFakeTimers();
      const mockPayload = { message: 'test' };
      const mockSignature = 'test-signature';
      let processingAttempts = 0;
      let processedEvent: WebhookEvent | undefined;
      
      // Mock processWebhookEvent to fail multiple times
      jest.spyOn(service as any, 'processWebhookEvent').mockImplementation(async (e: WebhookEvent) => {
        if (processingAttempts >= 3) {
          e.processingStatus = WebhookProcessingStatus.FAILED;
          return;
        }
        processedEvent = e;
        processingAttempts++;
        console.log(`Processing attempt ${processingAttempts}, current event status: ${processedEvent.processingStatus}`);
        const error = new Error(`Processing failed attempt ${processingAttempts}`);
        console.log(`Attempt ${processingAttempts} failed, updating status to RETRYING`);
        throw error;
      });
      
      console.log('Starting webhook processing');
      const promise = service.handleWebhook(mockPayload, mockSignature, WebhookEventType.MESSAGE_SENT);
      console.log('Initial promise resolved');
      
      // Verify retry attempts and delays
      for (let i = 1; i <= 3; i++) {
        console.log(`Running retry ${i} with delay ${Math.pow(2, i) * 500}ms`);
        await jest.advanceTimersByTimeAsync(Math.pow(2, i) * 500);
        expect(processedEvent).toBeDefined();
        console.log(`After retry ${i} - Status: ${processedEvent!.processingStatus}, RetryCount: ${processedEvent!.retryCount}`);
      }
      
      await promise;
      
      expect(processingAttempts).toBe(3);
      expect(processedEvent).toBeDefined();
      expect(processedEvent!.processingStatus).toBe(WebhookProcessingStatus.FAILED);
      expect(processedEvent!.retryCount).toBe(3);
    }, 120000);
  });
});
