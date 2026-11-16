import type { Prisma } from '@prisma/client';
import { readiness } from '../dispatch/service.js';
import { reject } from '../auth/errors.js';

export async function operationalReport(tx: Prisma.TransactionClient, organizationId: string, from: Date, to: Date, now = new Date()) {
  const jobs = await tx.job.findMany({ where: { organizationId, arrivalStart: { gte: from, lt: to } }, include: { closure: true, followUp: { select: { createdAt: true } }, reportExclusion: true, assignments: { orderBy: { approvedAt: 'asc' }, take: 1 } }, orderBy: { id: 'asc' }, take: 10001 });
  if (jobs.length > 10000) return reject(400, 'REPORT_TOO_LARGE', 'Narrow the date range to at most 10,000 jobs');
  const initial = jobs.filter((job) => job.jobType === 'INITIAL'); let excludedCancelled = 0; let excludedManual = 0; let awaitingMaturity = 0; let eligibleMatured = 0; let missingOutcomes = 0; let firstVisitCompletions = 0; let linkedFollowUps = 0;
  const reasons = new Map<string, { reason: string; serviceCategory: string; count: number }>();
  for (const job of initial) {
    if (job.reportExclusion?.reason) { excludedManual++; continue; }
    if (job.status === 'CANCELLED') { excludedCancelled++; continue; }
    const anchor = Math.max(job.arrivalEnd.getTime(), job.closure?.closedAt.getTime() ?? 0);
    if (anchor + 14 * 86400000 > now.getTime()) { awaitingMaturity++; continue; }
    eligibleMatured++;
    if (!job.closure || job.status !== 'CLOSED') missingOutcomes++;
    const linked = !!job.followUp && job.followUp.createdAt.getTime() <= anchor + 14 * 86400000;
    if (job.status === 'CLOSED' && job.closure?.outcome === 'RESOLVED' && !linked) firstVisitCompletions++;
    if (linked) { linkedFollowUps++; const reason = job.closure?.followUpReason ?? 'UNCLASSIFIED'; const key = JSON.stringify([reason, job.serviceCategory]); const group = reasons.get(key) ?? { reason, serviceCategory: job.serviceCategory, count: 0 }; group.count++; reasons.set(key, group); }
  }
  const elapsed = jobs.flatMap((job) => job.assignments[0] ? [Math.max(0, (job.assignments[0].approvedAt.getTime() - job.createdAt.getTime()) / 60000)] : []).sort((a, b) => a - b);
  const eligibleGaps = jobs.filter((job) => ['DRAFT', 'TRIAGED', 'READY'].includes(job.status) && !job.reportExclusion?.reason);
  const evaluated = eligibleGaps.slice(0, 200); const gaps = new Map<string, { code: string; severity: string; count: number }>();
  for (const job of evaluated) { const current = await readiness(tx, organizationId, job.id, now); const seen = new Set<string>(); for (const check of current.result.checks) { if (check.status === 'PASS') continue; const code = check.code.startsWith('PART:') ? 'PART' : check.code.startsWith('PREREQUISITE:') ? 'PREREQUISITE' : check.code; const key = `${code}:${check.severity}`; if (seen.has(key)) continue; seen.add(key); const group = gaps.get(key) ?? { code, severity: check.severity, count: 0 }; group.count++; gaps.set(key, group); } }
  const middle = Math.floor(elapsed.length / 2);
  return { asOf: now.toISOString(), from: from.toISOString(), to: to.toISOString(), observationDays: 14 as const, initialJobs: initial.length, excludedCancelled, excludedManual, awaitingMaturity, eligibleMatured, missingOutcomes, firstVisitCompletions, linkedFollowUps, firstVisitCompletionRate: eligibleMatured ? firstVisitCompletions / eligibleMatured : null, followUpRate: eligibleMatured ? linkedFollowUps / eligibleMatured : null,
    preparation: { approvedJobs: elapsed.length, meanElapsedMinutes: elapsed.length ? elapsed.reduce((sum, value) => sum + value, 0) / elapsed.length : null, medianElapsedMinutes: elapsed.length ? elapsed.length % 2 ? elapsed[middle]! : (elapsed[middle - 1]! + elapsed[middle]!) / 2 : null }, followUpReasons: [...reasons.values()].sort((a, b) => a.reason.localeCompare(b.reason) || a.serviceCategory.localeCompare(b.serviceCategory)), readiness: { evaluatedJobs: evaluated.length, unevaluatedJobs: eligibleGaps.length - evaluated.length, gaps: [...gaps.values()].sort((a, b) => a.code.localeCompare(b.code) || a.severity.localeCompare(b.severity)) } };
}
