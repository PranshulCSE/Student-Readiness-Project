import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';

export function generateRequestId(): string {
  return `req_${crypto.randomBytes(12).toString('hex')}`;
}

export async function requestIdMiddleware(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const existing = req.headers['x-request-id'];
  const reqId = typeof existing === 'string' && existing.length > 0
    ? existing
    : generateRequestId();

  // Attach to request
  (req as any).requestId = reqId;
  reply.header('x-request-id', reqId);
}
