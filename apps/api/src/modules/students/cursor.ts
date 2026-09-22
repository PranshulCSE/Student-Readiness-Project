import crypto from 'node:crypto';
import { config } from '../../config/index.js';
import { ValidationError } from '../../domain/errors.js';

export interface StudentCursorPayload {
  val: string | number;
  id: string;
}

export function encodeCursor(payload: StudentCursorPayload): string {
  const data = JSON.stringify(payload);
  const base64Data = Buffer.from(data).toString('base64url');
  const hmac = crypto
    .createHmac('sha256', config.HMAC_CURSOR_SECRET)
    .update(base64Data)
    .digest('base64url');
  return `${base64Data}.${hmac}`;
}

export function decodeCursor(cursorStr: string): StudentCursorPayload {
  const parts = cursorStr.split('.');
  if (parts.length !== 2) {
    throw new ValidationError('Invalid pagination cursor format');
  }

  const [base64Data, providedHmac] = parts;
  const expectedHmac = crypto
    .createHmac('sha256', config.HMAC_CURSOR_SECRET)
    .update(base64Data)
    .digest('base64url');

  const providedBuf = Buffer.from(providedHmac);
  const expectedBuf = Buffer.from(expectedHmac);

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new ValidationError('Tampered or corrupted pagination cursor');
  }

  try {
    const raw = Buffer.from(base64Data, 'base64url').toString('utf8');
    return JSON.parse(raw) as StudentCursorPayload;
  } catch {
    throw new ValidationError('Failed to parse pagination cursor payload');
  }
}
