import { WebSocketGateway, WebSocketServer, SubscribeMessage, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { EmailRepliesService } from './email-replies.service';
import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['content-type', 'authorization'],
  },
  namespace: '/email',
  transports: ['websocket', 'polling'],
})
export class EmailGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EmailGateway.name);
  
  @WebSocketServer()
  server: Server;

  constructor(private readonly emailService: EmailService) {}

  afterInit(server: Server) {
    try {
      this.emailService.authorizeGmailApi();
      this.logger.log('Email WebSocket Gateway initialized');
      
      // Send initial config to all connected clients
      server.emit('emailConfig', {
        serviceId: process.env.EMAILJS_SERVICE_ID,
        templateId: process.env.EMAILJS_TEMPLATE_ID,
        userId: process.env.EMAILJS_USER_ID,
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
      });
    } catch (error) {
      this.logger.error('Failed to initialize Email Gateway:', error);
    }
  }

  handleConnection(client: Socket) {
    try {
      this.logger.log(`Client connected: ${JSON.stringify(client.id)}`);
      
      // Send config to newly connected client
      client.emit('emailConfig', {
        serviceId: process.env.EMAILJS_SERVICE_ID,
        templateId: process.env.EMAILJS_TEMPLATE_ID,
        userId: process.env.EMAILJS_USER_ID,
        publicKey: process.env.EMAILJS_PUBLIC_KEY,
      });
      
      // this.emailService.sendEmail(client.id);
    } catch (error) {
      this.logger.error(`Error handling client connection ${client.id}:`, error);
    }
  }

  handleDisconnect(client: Socket) {
    try {
      this.logger.log(`Client disconnected: ${client.id}`);
      // this.emailService.handleDisconnect(client.id);
    } catch (error) {
      this.logger.error(`Error handling client disconnect ${client.id}:`, error);
    }
  }

  @SubscribeMessage('email-sent')
  handleEmailSent(client: Socket, payload: any) {
    try {
      this.logger.debug(`Email sent event from ${client.id}:`, payload);
      this.emailService.sendEmail(client.id, payload.email,JSON.stringify(payload));
      client.emit('emailProcessed', { success: true, emailId: payload.threadId });
    } catch (error) {
      this.logger.error(`Error handling email sent from ${client.id}:`, error);
      client.emit('emailProcessed', { success: false, error: error.message });
    }
  }

  @SubscribeMessage('email-error')
  handleEmailError(client: Socket, payload: any) {
    try {
      this.logger.error(`Email error from ${client.id}:`, payload);
      // this.emailService.handleEmailError(client.id, payload);
      client.emit('emailProcessed', { success: false, error: payload.error });
    } catch (error) {
      this.logger.error(`Error handling email error from ${client.id}:`, error);
    }
  }
}
