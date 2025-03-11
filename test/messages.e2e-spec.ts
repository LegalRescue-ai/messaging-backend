import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Messages (e2e)', () => {
  let app: INestApplication;
  const testAttorney = {
    userId: '12345',
    nickname: 'John Doe',
    role: 'attorney'
  };
  const testClient = {
    userId: '67890',
    nickname: 'Jane Smith',
    role: 'client'
  };
  let channelUrl: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register test users
    await request(app.getHttpServer())
      .post('/users/register')
      .send(testAttorney);

    await request(app.getHttpServer())
      .post('/users/register')
      .send(testClient);

    // Create a channel between attorney and client
    const channelResponse = await request(app.getHttpServer())
      .post('/channels/create')
      .send({
        clientId: testClient.userId,
        attorneyId: testAttorney.userId
      });

    channelUrl = channelResponse.body.url;
  });

  describe('Messaging Flow', () => {
    it('should send and receive messages', async () => {
      // Send a message from attorney
      const attorneyMessage = await request(app.getHttpServer())
        .post(`/messages/${channelUrl}/send`)
        .send({
          userId: testAttorney.userId,
          message: 'Hello, how can I help you today?'
        })
        .expect(201);

      expect(attorneyMessage.body.message).toBeDefined();

      // Send a reply from client
      const clientMessage = await request(app.getHttpServer())
        .post(`/messages/${channelUrl}/send`)
        .send({
          userId: testClient.userId,
          message: 'I need legal advice regarding my case.'
        })
        .expect(201);

      expect(clientMessage.body.message).toBeDefined();

      // Get channel messages
      const messages = await request(app.getHttpServer())
        .get(`/messages/${channelUrl}`)
        .query({ userId: testAttorney.userId })
        .expect(200);

      expect(messages.body).toHaveLength(2);
    });

    it('should handle message reactions', async () => {
      // Send a message
      const message = await request(app.getHttpServer())
        .post(`/messages/${channelUrl}/send`)
        .send({
          userId: testAttorney.userId,
          message: 'Please review the attached document.'
        })
        .expect(201);

      // Add a reaction
      await request(app.getHttpServer())
        .post(`/messages/${channelUrl}/${message.body.messageId}/react`)
        .send({
          userId: testClient.userId,
          reaction: '👍'
        })
        .expect(201);
    });

    it('should handle file attachments', async () => {
      // Create a mock file
      const mockFile = Buffer.from('Mock file content');

      // Upload file
      const fileUpload = await request(app.getHttpServer())
        .post('/files/upload')
        .attach('file', mockFile, 'test.txt')
        .expect(201);

      // Send message with file
      const messageWithFile = await request(app.getHttpServer())
        .post(`/messages/${channelUrl}/send`)
        .send({
          userId: testAttorney.userId,
          message: 'Here is the document you requested',
          fileUrl: fileUpload.body.url
        })
        .expect(201);

      expect(messageWithFile.body.fileUrl).toBeDefined();
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
