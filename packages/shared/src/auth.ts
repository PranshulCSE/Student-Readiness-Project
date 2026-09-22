import { z } from 'zod';

export const UserRoleSchema = z.enum(['admin', 'evaluator', 'viewer']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: UserRoleSchema,
  email: z.string().email().optional(),
  exp: z.number().int().optional(),
  iat: z.number().int().optional(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantId: z.string().uuid().optional(), // optional during multi-tenant login lookup
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    email: z.string().email(),
    role: UserRoleSchema,
  }),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;
