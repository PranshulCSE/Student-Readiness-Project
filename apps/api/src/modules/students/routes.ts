import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { authenticate } from '../../auth/tenant.js';
import { requireRoles } from '../../auth/rbac.js';
import { StudentsService } from './service.js';
import {
  StudentQuerySchema,
  PatchStudentSchema,
} from '@student-readiness/shared';
import { ValidationError } from '../../domain/errors.js';

export const studentsRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const service = new StudentsService();

  // GET /api/students
  app.get(
    '/students',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const parsedQuery = StudentQuerySchema.parse(request.query);
      const result = await service.listStudents(tenantId, parsedQuery);
      return reply.status(200).send(result);
    }
  );

  // GET /api/students/:id
  app.get<{ Params: { id: string } }>(
    '/students/:id',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const studentId = request.params.id;
      const result = await service.getStudentDetail(tenantId, studentId);
      return reply.status(200).send(result);
    }
  );

  // PATCH /api/students/:id
  app.patch<{ Params: { id: string } }>(
    '/students/:id',
    {
      preHandler: [authenticate, requireRoles('admin')],
    },
    async (request, reply) => {
      const tenantId = request.user!.tenantId;
      const studentId = request.params.id;

      // Header: If-Match: <current version> required (§4.6)
      const ifMatchHeader = request.headers['if-match'];
      if (!ifMatchHeader) {
        throw new ValidationError('If-Match header is required for updates', [
          { field: 'if-match', code: 'HEADER_REQUIRED', message: 'If-Match header with version is required' },
        ]);
      }

      const version = parseInt(ifMatchHeader.toString(), 10);
      if (isNaN(version) || version <= 0) {
        throw new ValidationError('If-Match header must be a positive integer', [
          { field: 'if-match', code: 'INVALID_HEADER', message: 'If-Match header must be a positive integer' },
        ]);
      }

      // Allowlist validation: strictly fullName, email, status only
      const parsedBody = PatchStudentSchema.parse(request.body);

      const result = await service.patchStudent(tenantId, studentId, version, parsedBody);
      return reply.status(200).send(result);
    }
  );
};
