import { z } from 'zod';

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('servicegrid-api'),
  version: z.string(),
  timestamp: z.iso.datetime(),
  checks: z.object({ database: z.enum(['up', 'down', 'not_checked']) }),
});
export type Health = z.infer<typeof healthSchema>;

export const errorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), traceId: z.string() }),
});

export const roleSchema = z.enum(['OWNER', 'DISPATCHER', 'TECHNICIAN']);
export const organizationSchema = z.object({ id: z.uuid(), name: z.string(), role: roleSchema });
export const sessionSchema = z.object({
  user: z.object({ id: z.uuid(), email: z.email(), name: z.string() }),
  csrfToken: z.string(), expiresAt: z.iso.datetime(), activeOrganization: organizationSchema.nullable(),
});
export type Session = z.infer<typeof sessionSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export const membershipSchema = z.object({ id: z.uuid(), name: z.string(), email: z.email(), role: roleSchema, active: z.boolean() });
export type Membership = z.infer<typeof membershipSchema>;
