import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../domain/errors.js';
import type { ErrorEnvelope, FieldError } from '@student-readiness/shared';

export function errorHandler(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const requestId = (request as any).requestId || 'req_unknown';

  // 1. AppError (our custom domain errors)
  if (error instanceof AppError) {
    const payload: ErrorEnvelope = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        fieldErrors: error.fieldErrors,
        currentVersion: error.currentVersion,
      },
    };
    reply.status(error.statusCode).send(payload);
    return;
  }

  // 2. Zod validation error
  if (error instanceof ZodError) {
    const fieldErrors: FieldError[] = error.errors.map((e) => ({
      field: e.path.join('.'),
      code: e.code.toUpperCase(),
      message: e.message,
    }));

    const payload: ErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'One or more fields are invalid',
        requestId,
        fieldErrors,
      },
    };
    reply.status(400).send(payload);
    return;
  }

  // 3. Fastify Rate Limit Error
  if ((error as FastifyError).statusCode === 429) {
    const payload: ErrorEnvelope = {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests, please slow down',
        requestId,
      },
    };
    reply.status(429).send(payload);
    return;
  }

  // 4. Fastify native validation error (if any)
  if ((error as any).validation) {
    const fieldErrors: FieldError[] = ((error as any).validation || []).map((v: any) => ({
      field: v.instancePath ? v.instancePath.replace(/^\//, '') : (v.params?.missingProperty || 'unknown'),
      code: 'INVALID_FIELD',
      message: v.message || 'Invalid field',
    }));

    const payload: ErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Validation error',
        requestId,
        fieldErrors,
      },
    };
    reply.status(400).send(payload);
    return;
  }

  // 5. Unknown internal error - NEVER leak stack trace, connection strings, or DB details
  request.log.error({ err: error, requestId }, 'Unhandled internal server error');

  const payload: ErrorEnvelope = {
    error: {
      code: 'INTERNAL',
      message: 'An unexpected internal error occurred',
      requestId,
    },
  };

  reply.status(500).send(payload);
}
