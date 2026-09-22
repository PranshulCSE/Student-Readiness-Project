import type { ErrorCode, FieldError } from '@student-readiness/shared';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly fieldErrors?: FieldError[];
  public readonly currentVersion?: number;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    options?: { fieldErrors?: FieldError[]; currentVersion?: number }
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fieldErrors = options?.fieldErrors;
    this.currentVersion = options?.currentVersion;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message, 404);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'One or more fields are invalid', fieldErrors?: FieldError[]) {
    super('VALIDATION_ERROR', message, 400, { fieldErrors });
  }
}

export class ConflictVersionError extends AppError {
  constructor(currentVersion: number, message = 'Resource version conflict') {
    super('CONFLICT_VERSION', message, 409, { currentVersion });
  }
}

export class ConflictIdempotencyError extends AppError {
  constructor(message = 'Idempotency key has already been used with different request parameters') {
    super('CONFLICT_IDEMPOTENCY', message, 409);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super('RATE_LIMITED', message, 429);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super('INTERNAL', message, 500);
  }
}
