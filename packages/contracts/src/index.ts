import { z } from 'zod';

export const importKindSchema = z.enum(['customers', 'sites', 'equipment', 'technicians', 'jobs', 'parts']);
export const importDryRunInputSchema = z.object({ kind: importKindSchema, sourceSystem: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), csvBase64: z.string().min(4).max(6990508), mapping: z.record(z.string().min(1).max(80), z.string().min(1).max(160)).default({}) }).strict();
export const importCommitInputSchema = z.object({ fileHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const importIssueSchema = z.object({ row: z.number().int().nonnegative(), field: z.string(), code: z.string(), message: z.string() });
export const importValidationSchema = z.object({ valid: z.boolean(), totalRows: z.number().int(), createCount: z.number().int(), skipCount: z.number().int(), errorCount: z.number().int(), errors: z.array(importIssueSchema) });
export const importBatchSchema = z.object({ id: z.uuid(), kind: importKindSchema, sourceSystem: z.string(), fileHash: z.string(), status: z.enum(['VALIDATED', 'INVALID', 'COMMITTED']), createdAt: z.iso.datetime(), expiresAt: z.iso.datetime(), committedAt: z.iso.datetime().nullable(), validation: importValidationSchema });
export const reportExclusionInputSchema = z.object({ version: z.number().int().positive(), reason: z.enum(['PLANNED_MULTI_VISIT', 'DATA_QUALITY']).nullable(), note: z.string().trim().min(1).max(2000) }).strict();
export const reportExclusionSchema = reportExclusionInputSchema.extend({ jobId: z.uuid(), note: z.string(), updatedAt: z.iso.datetime().nullable() });
export const operationalReportSchema = z.object({ asOf: z.iso.datetime(), from: z.iso.datetime(), to: z.iso.datetime(), observationDays: z.literal(14), initialJobs: z.number(), excludedCancelled: z.number(), excludedManual: z.number(), awaitingMaturity: z.number(), eligibleMatured: z.number(), missingOutcomes: z.number(), firstVisitCompletions: z.number(), linkedFollowUps: z.number(), firstVisitCompletionRate: z.number().nullable(), followUpRate: z.number().nullable(), preparation: z.object({ approvedJobs: z.number(), meanElapsedMinutes: z.number().nullable(), medianElapsedMinutes: z.number().nullable() }), followUpReasons: z.array(z.object({ reason: z.string(), serviceCategory: z.string(), count: z.number() })), readiness: z.object({ evaluatedJobs: z.number(), unevaluatedJobs: z.number(), gaps: z.array(z.object({ code: z.string(), severity: z.string(), count: z.number() })) }) });
export const auditPageSchema = z.object({ items: z.array(z.object({ id: z.uuid(), actorName: z.string(), action: z.string(), targetId: z.string(), details: z.record(z.string(), z.unknown()), createdAt: z.iso.datetime() })), total: z.number(), page: z.number(), limit: z.number() });

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
export const jobStatusSchema = z.enum(['DRAFT', 'TRIAGED', 'READY', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'CLOSED', 'CANCELLED']);
export const jobPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const jobInputSchema = z.object({
  customerId: z.uuid(), siteId: z.uuid(), equipmentId: z.uuid(), complaint: text(4000), serviceCategory: text(120).default('GENERAL_SERVICE'), priority: jobPrioritySchema,
  arrivalStart: z.iso.datetime({ offset: true }), arrivalEnd: z.iso.datetime({ offset: true }),
  estimatedDurationMinutes: z.number().int().min(15).max(1440), travelBufferMinutes: z.number().int().min(0).max(480),
}).strict();
export function validArrivalWindow(input: { arrivalStart: string; arrivalEnd: string }) {
  const span = Date.parse(input.arrivalEnd) - Date.parse(input.arrivalStart);
  return span > 0 && span <= 7 * 24 * 60 * 60_000;
}
export const jobUpdateSchema = jobInputSchema.extend({ version: z.number().int().positive() });
export const jobTransitionSchema = z.object({ version: z.number().int().positive(), status: z.enum(['DRAFT', 'TRIAGED']), reason: z.string().trim().max(2000) }).strict();
const recordFields = { id: z.uuid(), version: z.number().int().positive(), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const customerSchema = customerInputSchema.extend(recordFields).strip();
export const siteSchema = siteInputSchema.extend(recordFields).strip();
export const equipmentSchema = equipmentInputSchema.extend(recordFields).strip();
export const jobSchema = jobInputSchema.extend({ ...recordFields, status: jobStatusSchema, plannedStart: z.iso.datetime().nullable(), jobType: z.enum(['INITIAL', 'FOLLOW_UP']).default('INITIAL'), parentJobId: z.uuid().nullable().default(null), rootJobId: z.uuid().nullable().default(null) }).strip();
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

const positiveVersion = z.number().int().positive();
const instant = z.iso.datetime({ offset: true });
export const branchInputSchema = z.object({ name: text(120), address: text(500) }).strict();
export const skillInputSchema = z.object({ name: text(120) }).strict();
export const technicianInputSchema = z.object({ membershipId: z.uuid(), branchId: z.uuid() }).strict();
export const technicianUpdateSchema = z.object({ version: positiveVersion, branchId: z.uuid(), active: z.boolean(), safetyRestricted: z.boolean() }).strict();
export const verifiedSkillInputSchema = z.object({ version: positiveVersion, level: z.number().int().min(1).max(3), expiresAt: instant.nullable(), evidence: text(2000), active: z.boolean() }).strict();
export const availabilityInputSchema = z.object({ version: positiveVersion, kind: z.enum(['SHIFT', 'UNAVAILABLE']), startsAt: instant, endsAt: instant, reason: text(1000) }).strict();
export const schedulingInputSchema = z.object({ version: positiveVersion, branchId: z.uuid(), allowCrossBranch: z.boolean(), generalInspection: z.boolean(), requirements: z.array(z.object({ skillId: z.uuid(), level: z.number().int().min(1).max(3) }).strict()).max(30) }).strict();
export const eligibilityInputSchema = z.object({ version: positiveVersion, plannedStart: instant }).strict();
export const branchSchema = branchInputSchema.extend({ id: z.uuid() }).strip();
export const skillSchema = skillInputSchema.extend({ id: z.uuid() }).strip();
export const availabilitySchema = z.object({ id: z.uuid(), kind: z.enum(['SHIFT', 'UNAVAILABLE']), startsAt: z.iso.datetime(), endsAt: z.iso.datetime(), reason: z.string() });
export const technicianSchema = z.object({ id: z.uuid(), membershipId: z.uuid(), branchId: z.uuid(), name: z.string(), email: z.email(), active: z.boolean(), safetyRestricted: z.boolean(), membershipActive: z.boolean(), version: positiveVersion,
  skills: z.array(z.object({ skillId: z.uuid(), name: z.string(), level: z.number(), active: z.boolean(), expiresAt: z.iso.datetime().nullable(), verifiedAt: z.iso.datetime(), verifierName: z.string(), evidence: z.string() })), availability: z.array(availabilitySchema) });
export const schedulingSchema = schedulingInputSchema.omit({ version: true }).extend({ id: z.uuid(), jobVersion: positiveVersion, requirements: z.array(z.object({ skillId: z.uuid(), level: z.number().int().min(1).max(3) })) }).strip();
export const eligibilitySchema = z.object({ jobVersion: positiveVersion, evaluatedAt: z.iso.datetime(), appointment: z.object({ plannedStart: z.iso.datetime(), reservedFrom: z.iso.datetime(), endsAt: z.iso.datetime() }), candidates: z.array(z.object({ technicianId: z.uuid(), name: z.string(), branchName: z.string(), eligible: z.boolean(), checks: z.array(z.object({ code: z.string(), passed: z.boolean(), message: z.string() })) })) });
export type TechnicianRecord = z.infer<typeof technicianSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type Eligibility = z.infer<typeof eligibilitySchema>;

export const partInputSchema = z.object({ sku: text(80), name: text(160), unit: text(40) }).strict();
export const stockLocationInputSchema = z.object({ branchId: z.uuid(), name: text(120), kind: z.enum(['BRANCH', 'VAN']) }).strict();
export const preparationInputSchema = z.object({ version: positiveVersion, plannedStart: instant, partsReviewed: z.boolean(), prerequisitesReviewed: z.boolean() }).strict();
export const jobPartInputSchema = z.object({ version: positiveVersion, partId: z.uuid(), locationId: z.uuid(), quantity: z.string().regex(/^(?!0+(?:\.0+)?$)\d{1,9}(?:\.\d{1,3})?$/), state: z.enum(['SUSPECTED', 'REQUIRED', 'NOT_NEEDED']), reason: text(2000) }).strict();
export const partConfirmationInputSchema = z.object({ version: positiveVersion, status: z.enum(['CONFIRMED', 'UNAVAILABLE', 'UNKNOWN']), note: text(2000) }).strict();
export const prerequisiteInputSchema = z.object({ version: positiveVersion, code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,59}$/), kind: z.enum(['SAFETY', 'ACCESS']), label: text(160), rationale: text(2000) }).strict();
export const prerequisiteEvidenceInputSchema = z.object({ version: positiveVersion, status: z.enum(['PASS', 'FAIL', 'UNKNOWN']), note: text(2000) }).strict();
export const warningInputSchema = z.object({ version: positiveVersion, code: text(160), reason: text(2000) }).strict();
export const assignmentInputSchema = z.object({ version: positiveVersion, technicianId: z.uuid(), approvalReason: text(2000) }).strict();
export const freshnessInputSchema = z.object({ policyVersion: positiveVersion, hours: z.number().int().min(1).max(168) }).strict();
export const partSchema = partInputSchema.extend({ id: z.uuid() }).strip();
export const stockLocationSchema = stockLocationInputSchema.extend({ id: z.uuid() }).strip();
export const readinessCheckSchema = z.object({ code: z.string(), status: z.enum(['PASS', 'FAIL', 'UNKNOWN']), severity: z.enum(['BLOCKER', 'WARNING']), message: z.string(), evidenceId: z.string().nullable(), verifiedBy: z.string().nullable(), verifiedAt: z.iso.datetime().nullable(), acknowledged: z.boolean() });
export const readinessSchema = z.object({ status: z.enum(['BLOCKED', 'NEEDS_REVIEW', 'READY']), jobVersion: positiveVersion, policyVersion: positiveVersion, evaluatedAt: z.iso.datetime(), plannedStart: z.iso.datetime().nullable(), checks: z.array(readinessCheckSchema), manualPartsNotice: z.string() });
export const preparationSchema = z.object({ jobVersion: positiveVersion, plannedStart: z.iso.datetime().nullable(), partsReviewed: z.boolean(), prerequisitesReviewed: z.boolean(), partsFreshnessHours: z.number(), policyVersion: positiveVersion,
  parts: z.array(z.object({ id: z.uuid(), partId: z.uuid(), locationId: z.uuid(), quantity: z.string(), state: z.enum(['SUSPECTED', 'REQUIRED', 'NOT_NEEDED']), reason: z.string(), revision: positiveVersion, part: partSchema, location: stockLocationSchema, latest: z.object({ status: z.string(), note: z.string(), confirmedAt: z.iso.datetime(), requirementRevision: z.number(), plannedStart: z.iso.datetime(), verifierName: z.string() }).nullable() })),
  prerequisites: z.array(z.object({ id: z.uuid(), code: z.string(), kind: z.string(), label: z.string(), rationale: z.string(), latest: z.object({ status: z.string(), note: z.string(), verifiedAt: z.iso.datetime(), plannedStart: z.iso.datetime(), verifierName: z.string() }).nullable() })),
});
export const rankedCandidateSchema = eligibilitySchema.shape.candidates.element.extend({ score: z.number().nullable(), skillDepth: z.number(), workloadHeadroom: z.number(), assetFamiliarity: z.number(), bookedMinutes: z.number(), shiftMinutes: z.number(), resolvedVisits: z.number(), historyStatus: z.enum(['AVAILABLE', 'NO_HISTORY']), contributions: z.object({ skillDepth: z.number(), workloadHeadroom: z.number(), assetFamiliarity: z.number() }) });
export const rankingSchema = z.object({ policyVersion: z.literal('dispatch-v2'), jobVersion: positiveVersion, evaluatedAt: z.iso.datetime(), readiness: readinessSchema, appointment: eligibilitySchema.shape.appointment, candidates: z.array(rankedCandidateSchema) });
export const assignmentResultSchema = z.object({ assignmentId: z.uuid(), jobId: z.uuid(), jobVersion: positiveVersion, status: z.literal('ASSIGNED') });
export const assignmentSchema = z.object({ id: z.uuid(), technicianId: z.uuid(), technicianName: z.string(), approvedByName: z.string(), approvedAt: z.iso.datetime(), approvalReason: z.string(), active: z.boolean(), reservedFrom: z.iso.datetime(), plannedStart: z.iso.datetime(), endsAt: z.iso.datetime() });
export type Readiness = z.infer<typeof readinessSchema>;
export type Preparation = z.infer<typeof preparationSchema>;
export type Ranking = z.infer<typeof rankingSchema>;

export const visitActionInputSchema = z.object({ version: positiveVersion, assignmentId: z.uuid() }).strict();
export const followUpReasonSchema = z.enum(['PARTS', 'SKILLS', 'INFORMATION', 'ACCESS', 'NEW_FAULT', 'CUSTOMER_REQUEST', 'OTHER']);
export const closeVisitInputSchema = visitActionInputSchema.extend({ outcome: z.enum(['RESOLVED', 'FOLLOW_UP_REQUIRED']), notes: text(4000), followUpReason: followUpReasonSchema.nullable(), followUpWindow: z.object({ arrivalStart: instant, arrivalEnd: instant }).strict().nullable() });
export const observationInputSchema = visitActionInputSchema.extend({ kind: z.enum(['NOTE', 'PART_USAGE', 'CORRECTION']), note: text(4000), partId: z.uuid().nullable(), partLabel: text(160).nullable(), quantity: jobPartInputSchema.shape.quantity.nullable(), correctsId: z.uuid().nullable() });
export const cancelVisitInputSchema = z.object({ version: positiveVersion, assignmentId: z.uuid().nullable(), reason: text(2000) }).strict();
export const rescheduleVisitInputSchema = visitActionInputSchema.extend({ reason: text(2000), arrivalStart: instant, arrivalEnd: instant, estimatedDurationMinutes: z.number().int().min(15).max(1440), travelBufferMinutes: z.number().int().min(0).max(480) });
export const visitActionResultSchema = z.object({ jobId: z.uuid(), jobVersion: positiveVersion, status: jobStatusSchema, assignmentId: z.uuid().nullable(), followUpJobId: z.uuid().nullable(), observationId: z.uuid().optional() });
export const visitAssignmentSchema = assignmentSchema.extend({ jobId: z.uuid(), acknowledgedAt: z.iso.datetime().nullable(), startedAt: z.iso.datetime().nullable(), endedAt: z.iso.datetime().nullable(), releaseKind: z.string().nullable(), releaseReason: z.string().nullable() });
export const observationSchema = z.object({ id: z.uuid(), kind: z.string(), note: z.string(), partId: z.uuid().nullable(), partLabel: z.string().nullable(), quantity: z.string().nullable(), correctsId: z.uuid().nullable(), actorName: z.string(), createdAt: z.iso.datetime() });
export const visitClosureSchema = z.object({ outcome: z.enum(['RESOLVED', 'FOLLOW_UP_REQUIRED']), followUpReason: followUpReasonSchema.nullable(), notes: z.string(), actorName: z.string(), closedAt: z.iso.datetime() });
export const visitCardSchema = z.object({ assignment: visitAssignmentSchema, job: jobSchema, customer: customerSchema, site: siteSchema, equipment: equipmentSchema, approvalReadiness: readinessSchema, currentEvidence: z.array(readinessCheckSchema), parts: z.array(z.object({ partId: z.uuid(), name: z.string(), unit: z.string() })), observations: z.array(observationSchema), closure: visitClosureSchema.nullable(), followUpJobId: z.uuid().nullable() });
export const myAssignmentSchema = z.object({ assignmentId: z.uuid(), jobId: z.uuid(), version: positiveVersion, status: jobStatusSchema, jobType: z.enum(['INITIAL', 'FOLLOW_UP']), customerName: z.string(), complaint: z.string(), plannedStart: z.iso.datetime(), endsAt: z.iso.datetime() });
export type VisitCard = z.infer<typeof visitCardSchema>;
