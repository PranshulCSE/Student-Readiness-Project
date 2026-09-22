import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../auth/tenant.js';
import { requireRoles } from '../../auth/rbac.js';
import { AttemptsService } from './service.js';
import { CreateAttemptSchema } from '@student-readiness/shared';
import { ValidationError } from '../../domain/errors.js';

export const attemptsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new AttemptsService();

  // POST /api/students/:id/attempts
  app.post<{ Params: { id: string } }>(
    '/students/:id/attempts',
    {
      preHandler: [authenticate, requireRoles('evaluator', 'admin')],
    },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const evaluatorId = request.user!.userId;
      const studentId = request.params.id;
      const requestId = (request as any).requestId;

      // 1. Idempotency-Key header is required (§4.5)
      const idempotencyKey = request.headers['idempotency-key'] as string | undefined;
      if (!idempotencyKey || idempotencyKey.trim().length === 0) {
        throw new ValidationError('Idempotency-Key header is required for attempt submission', [
          { field: 'idempotency-key', code: 'HEADER_REQUIRED', message: 'Idempotency-Key header is required' },
        ]);
      }

      // 2. Optional If-Match header
      let ifMatchVersion: number | undefined;
      const ifMatchHeader = request.headers['if-match'];
      if (ifMatchHeader) {
        const parsed = parseInt(ifMatchHeader.toString(), 10);
        if (!isNaN(parsed) && parsed > 0) {
          ifMatchVersion = parsed;
        }
      }

      // 3. Body validation
      const parsedBody = CreateAttemptSchema.parse(request.body);

      const result = await service.submitAttempt({
        tenantId,
        studentId,
        evaluatorId,
        requestId,
        idempotencyKey,
        body: parsedBody,
        path: request.url,
        ifMatchVersion,
      });

      if (result.isReplayed) {
        reply.header('Idempotency-Replayed', 'true');
      }

      return reply.status(result.statusCode).send(result.data);
    }
  );
};
