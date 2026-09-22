import { z } from 'zod';
import { ErrorEnvelopeSchema, FieldError } from '@student-readiness/shared';

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly fieldErrors?: FieldError[];
  public readonly currentVersion?: number;

  constructor(
    code: string,
    message: string,
    statusCode: number,
    options?: {
      requestId?: string;
      fieldErrors?: FieldError[];
      currentVersion?: number;
    }
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = options?.requestId;
    this.fieldErrors = options?.fieldErrors;
    this.currentVersion = options?.currentVersion;
  }
}

let getAuthToken: () => string | null = () => localStorage.getItem('token');

export function setAuthTokenGetter(getter: () => string | null): void {
  getAuthToken = getter;
}

export interface ApiResponse<T> {
  data: T;
  headers: Headers;
  isReplayed: boolean;
}

export async function apiClient<T>(
  schema: z.ZodType<T>,
  path: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAuthToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const url = path.startsWith('http') ? path : path.startsWith('/api') ? path : `/api${path}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const isReplayed = response.headers.get('Idempotency-Replayed') === 'true';

  let json: unknown;
  const text = await response.text();
  try {
    json = text.length > 0 ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    // Attempt parsing standard error envelope
    const parsedErr = ErrorEnvelopeSchema.safeParse(json);
    if (parsedErr.success) {
      const { code, message, requestId, fieldErrors, currentVersion } = parsedErr.data.error;
      throw new ApiError(code, message, response.status, {
        requestId,
        fieldErrors,
        currentVersion,
      });
    }

    throw new ApiError('HTTP_ERROR', `Request failed with status ${response.status}`, response.status);
  }

  // Strictly validate runtime response payload against Zod schema
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('API boundary schema validation failed:', parsed.error);
    throw new ApiError(
      'VALIDATION_ERROR',
      'Received unexpected data structure from API',
      500
    );
  }

  return {
    data: parsed.data,
    headers: response.headers,
    isReplayed,
  };
}
