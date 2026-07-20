import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateEnvironment } from './common/env.validation';
import cookieParser = require('cookie-parser');

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.replace(/postgresql:\/\/\S+/gi, 'postgresql://[redacted]');
  }
  return 'Unknown bootstrap error';
}

export async function bootstrap() {
  let startupStage = 'environment_validation';

  try {
    validateEnvironment();
    startupStage = 'nest_factory_create';
    const app = await NestFactory.create(AppModule);
    startupStage = 'application_configuration';
    const httpServer = app.getHttpAdapter().getInstance();
    const configuredCorsOrigins =
      process.env.CORS_ORIGIN
        ?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) || [];

    if (process.env.NODE_ENV === 'production') {
      httpServer.set('trust proxy', 1);
    }

    httpServer.disable('x-powered-by');
    app.use(cookieParser());
    app.use((_req, res, next) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      next();
    });
    app.use((req, _res, next) => {
      const prefix = '/api/backend';
      if (req.url === prefix) {
        req.url = '/';
      } else if (req.url.startsWith(`${prefix}/`)) {
        req.url = req.url.slice(prefix.length);
      }
      next();
    });
    app.enableCors({
      origin: configuredCorsOrigins,
      credentials: true,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
    app.enableShutdownHooks();

    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3003;
    startupStage = 'listen';
    await app.listen(port);
    console.log(`Backend Application is running on port ${port}`);
  } catch (error) {
    console.error(`[Backend startup failed at ${startupStage}] ${safeErrorMessage(error)}`);
    throw error;
  }
}

export function startBackend() {
  void bootstrap().catch((error) => {
    console.error(`[Backend startup unhandled] ${safeErrorMessage(error)}`);
  });
}

if (require.main === module) {
  startBackend();
}
