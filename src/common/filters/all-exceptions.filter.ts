import { ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

const STATUS_CODE_MAP: Record<string, number> = {
  UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
  VALIDATION_ERROR: 422, CERTIFICADO_AUSENTE: 422, SEFAZ_REJEITADA: 422,
  CONFLITO_NUMERACAO: 409, RATE_LIMIT: 429, INTERNAL: 500,
};

const HTTP_TO_CODE: Record<number, string> = {
  400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
  404: 'NOT_FOUND', 409: 'CONFLITO_NUMERACAO', 422: 'VALIDATION_ERROR',
  429: 'RATE_LIMIT', 500: 'INTERNAL',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = 500;
    let code = 'INTERNAL';
    let message = 'Erro inesperado';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'object' && payload !== null) {
        const p = payload as Record<string, unknown>;
        code = (p.code as string) || HTTP_TO_CODE[status] || 'INTERNAL';
        message = (p.message as string) || exception.message;
        details = p.details;
      } else {
        message = String(payload);
        code = HTTP_TO_CODE[status] || 'INTERNAL';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(`${code} ${status} ${req.method} ${req.url} — ${message}`);

    res.status(STATUS_CODE_MAP[code] || status).json({
      error: { code, message, ...(details ? { details } : {}) },
    });
  }
}