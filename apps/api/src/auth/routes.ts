import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { getDbClient } from '../db/client.js';
import { signToken } from './jwt.js';
import { authenticate } from './tenant.js';
import { LoginRequestSchema } from '@student-readiness/shared';
import { UnauthenticatedError } from '../domain/errors.js';

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const db = getDbClient();

  // POST /api/auth/login
  app.post('/auth/login', async (request, reply) => {
    const body = LoginRequestSchema.parse(request.body);

    let userRow: any = null;

    if (body.tenantId) {
      const res = await db.query(
        `SELECT id, tenant_id, email, password_hash, role, status
         FROM users
         WHERE tenant_id = $1 AND email = $2`,
        [body.tenantId, body.email]
      );
      userRow = res.rows[0];
    } else {
      const res = await db.query(
        `SELECT id, tenant_id, email, password_hash, role, status
         FROM users
         WHERE email = $1`,
        [body.email]
      );
      userRow = res.rows[0];
    }

    if (!userRow) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    if (userRow.status === 'disabled') {
      throw new UnauthenticatedError('User account is disabled');
    }

    const passwordMatches = await bcrypt.compare(body.password, userRow.password_hash);
    if (!passwordMatches) {
      throw new UnauthenticatedError('Invalid email or password');
    }

    const token = signToken({
      userId: userRow.id,
      tenantId: userRow.tenant_id,
      role: userRow.role,
      email: userRow.email,
    });

    return reply.status(200).send({
      accessToken: token,
      user: {
        id: userRow.id,
        tenantId: userRow.tenant_id,
        email: userRow.email,
        role: userRow.role,
      },
    });
  });

  // GET /api/auth/me
  app.get(
    '/auth/me',
    {
      preHandler: [authenticate],
    },
    async (request, reply) => {
      return reply.status(200).send({
        user: request.user,
      });
    }
  );
};
