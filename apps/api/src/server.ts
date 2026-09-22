import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { REDACT_PATHS } from './middleware/redaction.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './auth/routes.js';
import { studentsRoutes } from './modules/students/routes.js';
import { attemptsRoutes } from './modules/attempts/routes.js';
import { activityRoutes } from './modules/activity/routes.js';
import { outboxPublisher } from './outbox/publisher.js';

export function buildApp(): FastifyInstance {
  const app = fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    },
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // Global Request ID
  app.addHook('onRequest', requestIdMiddleware);

  // CORS
  app.register(cors, {
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // Rate Limiting (§7: keyed by tenantId + userId, plus IP fallback)
  app.register(rateLimit, {
    max: (req) => {
      // 100 req/min for reads, 20 req/min for mutations
      return req.method === 'GET' ? 100 : 20;
    },
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      if (req.user) {
        return `${req.user.tenantId}:${req.user.userId}`;
      }
      return req.ip;
    },
    errorResponseBuilder: (req, _context) => {
      const requestId = (req as any).requestId || 'req_unknown';
      return {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests, please slow down',
          requestId,
        },
      };
    },
  });

  // Global Error Handler
  app.setErrorHandler(errorHandler);

  // Register API routes under /api
  app.register(async (api) => {
    api.register(authRoutes);
    api.register(studentsRoutes);
    api.register(attemptsRoutes);
    api.register(activityRoutes);
  }, { prefix: '/api' });

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}

export async function startServer(): Promise<FastifyInstance> {
  const app = buildApp();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Server listening on http://${config.HOST}:${config.PORT}`);

    // Start outbox worker in non-test environment
    if (config.NODE_ENV !== 'test') {
      outboxPublisher.start();
    }

    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Start server in non-test environment
if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err);
  });
}
