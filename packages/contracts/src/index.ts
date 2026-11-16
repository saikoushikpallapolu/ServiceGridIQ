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

const text = (max: number) => z.string().trim().min(1).max(max);
export const customerInputSchema = z.object({ name: text(160), email: z.email().max(254).nullable(), phone: text(40).nullable() }).strict();
export const siteInputSchema = z.object({ customerId: z.uuid(), name: text(160), address: text(500), accessNotes: z.string().trim().max(2000) }).strict();
export const equipmentInputSchema = z.object({ siteId: z.uuid(), manufacturer: text(120), model: text(120), serialNumber: text(160), notes: z.string().trim().max(2000) }).strict();
export const jobStatusSchema = z.enum(['DRAFT', 'TRIAGED']);
export const jobPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const jobInputSchema = z.object({
  customerId: z.uuid(), siteId: z.uuid(), equipmentId: z.uuid(), complaint: text(4000), priority: jobPrioritySchema,
  arrivalStart: z.iso.datetime({ offset: true }), arrivalEnd: z.iso.datetime({ offset: true }),
  estimatedDurationMinutes: z.number().int().min(15).max(1440), travelBufferMinutes: z.number().int().min(0).max(480),
}).strict();
export function validArrivalWindow(input: { arrivalStart: string; arrivalEnd: string }) {
  const span = Date.parse(input.arrivalEnd) - Date.parse(input.arrivalStart);
  return span > 0 && span <= 7 * 24 * 60 * 60_000;
}
export const jobUpdateSchema = jobInputSchema.extend({ version: z.number().int().positive() });
export const jobTransitionSchema = z.object({ version: z.number().int().positive(), status: jobStatusSchema, reason: z.string().trim().max(2000) }).strict();
const recordFields = { id: z.uuid(), version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const customerSchema = customerInputSchema.extend(recordFields).strip();
export const siteSchema = siteInputSchema.extend(recordFields).strip();
export const equipmentSchema = equipmentInputSchema.extend(recordFields).strip();
export const jobSchema = jobInputSchema.extend({ ...recordFields, status: jobStatusSchema }).strip();
export const jobSummarySchema = jobSchema.extend({ customerName: z.string(), siteName: z.string(), equipmentLabel: z.string() });
export const jobEventSchema = z.object({ id: z.uuid(), kind: z.string(), note: z.string(), createdAt: z.iso.datetime(), actorName: z.string() });
export const jobDetailSchema = jobSchema.extend({ customer: customerSchema, site: siteSchema, equipment: equipmentSchema,
  timeline: z.array(jobEventSchema), equipmentHistory: z.array(jobSummarySchema) });
export type Customer = z.infer<typeof customerSchema>;
export type Site = z.infer<typeof siteSchema>;
export type Equipment = z.infer<typeof equipmentSchema>;
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
