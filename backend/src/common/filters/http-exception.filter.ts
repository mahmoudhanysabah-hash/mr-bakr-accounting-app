import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const error = this.toSafeMessage(exceptionResponse);

    console.error(`[Error] ${request.method} ${request.url}`, exception);

    response.status(status).json({
      success: false,
      timestamp: new Date().toISOString(),
      path: request.url,
      error,
    });
  }

  private toSafeMessage(value: unknown): string {
    if (typeof value === 'string' && value.trim()) return value;
    if (Array.isArray(value)) {
      const messages = value.map((item) => this.toSafeMessage(item)).filter(Boolean);
      return messages.join(', ') || 'Request failed';
    }
    if (value && typeof value === 'object' && 'message' in value) {
      return this.toSafeMessage((value as { message?: unknown }).message);
    }
    return 'Internal server error';
  }
}
