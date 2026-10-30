import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Security Headers via Helmet configured for Cross-Origin REST API
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  const frontendUrl = process.env.FRONTEND_URL || 'https://digihiverift.online';

  // Dynamic CORS configuration allowing all authorized client origins
  app.enableCors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      // allow all origins (including digihiverift.online, localhost, 127.0.0.1, etc.)
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global rate limiter on API endpoints
  app.use(
    rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: 120, // 120 requests per minute
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        success: false,
        statusCode: 429,
        message: 'Too many requests; please slow down and retry shortly.',
      },
    }),
  );

  // Global Prefix: /api/v1
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  app.setGlobalPrefix(apiPrefix.replace(/^\//, ''));

  // Global Validation Pipe with DTO transformation and unknown field stripping
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global HTTP Exception Filter & Response Interceptor
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // Listen on Port 9009
  const port = parseInt(process.env.PORT, 10) || 9009;
  await app.listen(port);

  logger.log(`================================================================`);
  logger.log(` HIVERIFT EXAMINATION PORTAL BACKEND ENGINE RUNNING            `);
  logger.log(` Port: ${port} | Prefix: ${apiPrefix}                          `);
  logger.log(` Frontend URL: ${frontendUrl}                                   `);
  logger.log(` Environment: ${process.env.NODE_ENV || 'development'}         `);
  logger.log(`================================================================`);
}
bootstrap();

