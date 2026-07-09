import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { validateEnvironment } from './common/env.validation';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  validateEnvironment();
  const app = await NestFactory.create(AppModule);
  const configuredCorsOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const corsOrigins = configuredCorsOrigins?.length
    ? configuredCorsOrigins
    : ['http://localhost:3002', 'http://127.0.0.1:3002'];
  
  app.use(cookieParser());
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  // Security Layer & Hardening
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseInterceptor());
  
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3003;
  await app.listen(port);
  console.log(`Backend Application is running on: http://localhost:${port}`);
}
bootstrap();
