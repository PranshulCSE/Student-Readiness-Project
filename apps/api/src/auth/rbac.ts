import { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@student-readiness/shared';
import { ForbiddenError, UnauthenticatedError } from '../domain/errors.js';

export function requireRoles(...allowedRoles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      throw new UnauthenticatedError('User is not authenticated');
    }

    if (!allowedRoles.includes(request.user.role)) {
      throw new ForbiddenError(
        `Role '${request.user.role}' is not authorized to perform this action`
      );
    }
  };
}
