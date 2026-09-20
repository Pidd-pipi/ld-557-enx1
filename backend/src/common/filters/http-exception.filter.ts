import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'object' && payload !== null) {
      const body = payload as Record<string, unknown>;
      response.status(statusCode).json({
        statusCode,
        timestamp: new Date().toISOString(),
        path: request.url,
        ...body,
      });
      return;
    }

    response.status(statusCode).json({
      statusCode,
      message: typeof payload === 'string' ? payload : undefined,
      error: exception.name,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
