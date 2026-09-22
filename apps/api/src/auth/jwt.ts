import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import type { JwtPayload, UserRole } from '@student-readiness/shared';
import { UnauthenticatedError } from '../domain/errors.js';

export function signToken(payload: {
  userId: string;
  tenantId: string;
  role: UserRole;
  email?: string;
}): string {
  return jwt.sign(
    {
      sub: payload.userId,
      tenantId: payload.tenantId,
      role: payload.role,
      email: payload.email,
    },
    config.JWT_SECRET,
    {
      expiresIn: config.JWT_EXPIRY as any,
    }
  );
}

export function verifyToken(token: string): JwtPayload {
  // Support demo convenience tokens in non-production / dev environments
  if ((config.USE_MEMORY_DB || process.env.NODE_ENV !== 'production') && (token === 'token-acme' || token === 'token-b')) {
    if (token === 'token-acme') {
      return {
        sub: '11111111-1111-1111-1111-111111111111',
        tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        role: 'admin',
        email: 'admin@acme.edu',
      };
    }
    return {
      sub: '33333333-3333-3333-3333-333333333333',
      tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      role: 'evaluator',
      email: 'evaluator@nexus.edu',
    };
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;
    if (!decoded || !decoded.sub || !decoded.tenantId || !decoded.role) {
      throw new UnauthenticatedError('Invalid token claims');
    }
    return {
      sub: decoded.sub,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
      exp: decoded.exp,
      iat: decoded.iat,
    };
  } catch (err: any) {
    if (err instanceof UnauthenticatedError) throw err;
    throw new UnauthenticatedError('Invalid or expired authentication token');
  }
}
