import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
import { UnauthenticatedError } from '../domain/errors.js';
import { UserRole } from '@student-readiness/shared';

export interface AuthenticatedUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  email?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthenticatedError('Missing or malformed Authorization header');
  }

  const token = authHeader.substring('Bearer '.length).trim();
  if (!token) {
    throw new UnauthenticatedError('Authentication token missing');
  }

  const payload = verifyToken(token);

  // Strictly derive tenant from token. Never accept client-supplied tenantId!
  request.user = {
    userId: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    email: payload.email,
  };
}
