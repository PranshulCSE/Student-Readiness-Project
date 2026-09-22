import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../auth/tenant.js';
import { requireRoles } from '../../auth/rbac.js';
import { ActivityService } from './service.js';
import { ActivityQuerySchema } from '@student-readiness/shared';

export const activityRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new ActivityService();

  // GET /api/students/:id/activity
  app.get<{ Params: { id: string } }>(
    '/students/:id/activity',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const studentId = request.params.id;
      const query = ActivityQuerySchema.parse(request.query);
      const result = await service.listStudentActivity(tenantId, studentId, query);
      return reply.status(200).send(result);
    }
  );

  // GET /api/admin/events/duplicates (Mongo aggregation)
  app.get(
    '/admin/events/duplicates',
    {
      preHandler: [authenticate, requireRoles('admin')],
    },
    async (_request, reply) => {
      const result = await service.getDuplicateEventsAggregation();
      return reply.status(200).send(result);
    }
  );
};
