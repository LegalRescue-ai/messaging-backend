import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  logger.log('Starting application bootstrap process');
  
  const app = await NestFactory.create(AppModule);
  logger.log('NestJS application created');
  
  // Enable CORS with WebSocket support
  const allowedOrigins = [
    'http://localhost:5173',
    'https://legal-chat-frontend.onrender.com',
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  logger.log(`Configuring CORS with allowed origins: ${allowedOrigins.join(', ')}`);
  
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: [
      'content-type',
      'authorization',
      'access-control-allow-origin',
      'access-control-allow-credentials',
      'access-control-allow-methods',
      'access-control-allow-headers',
    ],
  });
  logger.log('CORS configuration applied');
  
  // Use Socket.IO adapter with CORS configuration
  try {
    logger.log('Configuring Socket.IO adapter');
    const ioAdapter = new IoAdapter(app);
    app.useWebSocketAdapter(ioAdapter);
    logger.log('Socket.IO adapter configured successfully');
  } catch (error) {
    logger.error('Failed to configure Socket.IO adapter:', error);
    throw error;
  }
  
  // Apply helmet middleware with WebSocket compatibility
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'connect-src': ["'self'", ...allowedOrigins, 'wss:', 'ws:'] as string[],
        'img-src': ["'self'", 'data:', 'https:'] as string[],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"] as string[],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  logger.log('Helmet middleware applied');
  
  // Enable validation
  app.useGlobalPipes(new ValidationPipe());
  logger.log('Global validation pipe configured');

  // Swagger documentation setup
  const config = new DocumentBuilder()
    .setTitle('Legal Chat API')
    .setDescription('API for legal chat application using Sendbird')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  logger.log('Swagger documentation configured');

  const port = process.env.PORT || 3000;
  logger.log(`Attempting to start server on port ${port}`);
  
  try {
    await app.listen(port);
    logger.log(`Server successfully started on port ${port}`);
  } catch (error) {
    logger.error(`Failed to start server on port ${port}:`, error);
    
    // Try alternative port if 3000 is in use
    if (error.code === 'EADDRINUSE') {
      const altPort = 3001;
      logger.log(`Attempting to use alternative port ${altPort}`);
      try {
        await app.listen(altPort);
        logger.log(`Server successfully started on alternative port ${altPort}`);
      } catch (altError) {
        logger.error(`Failed to start server on alternative port ${altPort}:`, altError);
        throw altError;
      }
    } else {
      throw error;
    }
  }
}
bootstrap();
