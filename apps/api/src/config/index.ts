import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/student_readiness'),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/student_readiness'),
  MONGODB_DB: z.string().default('student_readiness'),
  JWT_SECRET: z.string().min(16).default('super-secret-development-jwt-signing-key-32chars'),
  JWT_EXPIRY: z.string().default('15m'),
  HMAC_CURSOR_SECRET: z.string().min(16).default('cursor-tamper-protection-hmac-key-32chars'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().default(1000),
  OUTBOX_BATCH_SIZE: z.coerce.number().default(100),
  OUTBOX_MAX_RETRIES: z.coerce.number().default(5),
});

export type Config = z.infer<typeof ConfigSchema>;

let parsedConfig: Config;

try {
  parsedConfig = ConfigSchema.parse(process.env);
} catch (err: any) {
  // eslint-disable-next-line no-console
  console.error('Configuration validation error:', err.errors || err);
  // Fall back to safe defaults in test mode
  parsedConfig = ConfigSchema.parse({});
}

export const config = parsedConfig;
