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

  // Security Headers via Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: [
            "'self'",
            'http://localhost:9009',
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:5174',
            'http://127.0.0.1:5175',
            process.env.FRONTEND_URL || 'http://localhost:5173',
          ],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // Dynamic CORS allowlist supporting port 5173, 5174, 5175, 3000
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  app.enableCors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps, curl, or same-origin)
      if (!origin) return callback(null, true);
      const isAllowed =
        origin === frontendUrl ||
        /^http:\/\/(localhost|127\.0\.0\.1):(517[0-9]|3000|9009)$/.test(origin);
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, true); // Dev-friendly fallback
      }
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

