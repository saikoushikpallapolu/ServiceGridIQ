export const MANUAL_PARTS_NOTICE = 'Manual confirmations are timestamped evidence only. Parts are not reserved against competing use.';
export type Check = { code: string; status: 'PASS' | 'FAIL' | 'UNKNOWN'; severity: 'BLOCKER' | 'WARNING'; message: string; evidenceId: string | null; verifiedBy: string | null; verifiedAt: string | null; acknowledged: boolean };
export function overallReadiness(checks: Check[]): 'BLOCKED' | 'NEEDS_REVIEW' | 'READY' {
  if (checks.some((check) => check.severity === 'BLOCKER' && check.status !== 'PASS')) return 'BLOCKED';
  return checks.some((check) => check.severity === 'WARNING' && check.status !== 'PASS' && !check.acknowledged) ? 'NEEDS_REVIEW' : 'READY';
}
export function confirmationCurrent(input: { revision: number; visitRevision: number; plannedStart: Date | null; hours: number; now: Date; confirmation: { requirementRevision: number; visitRevision: number; plannedStart: Date; confirmedAt: Date; status: string } | null }) {
  const evidence = input.confirmation;
  return !!evidence && !!input.plannedStart && evidence.status === 'CONFIRMED' && evidence.requirementRevision === input.revision && evidence.visitRevision === input.visitRevision && evidence.plannedStart.getTime() === input.plannedStart.getTime() && evidence.confirmedAt <= input.now && input.now.getTime() - evidence.confirmedAt.getTime() < input.hours * 3600_000;
}
export type Span = { start: number; end: number };
export function union(spans: Span[]) {
  const result: Span[] = [];
  for (const span of spans.filter((item) => item.end > item.start).sort((a, b) => a.start - b.start)) { const last = result.at(-1); if (last && span.start <= last.end) last.end = Math.max(last.end, span.end); else result.push({ ...span }); }
  return result;
}
export function workload(shifts: Span[], unavailable: Span[], bookings: Span[], day: Span) {
  let available = union(shifts.map((span) => ({ start: Math.max(span.start, day.start), end: Math.min(span.end, day.end) })));
  for (const absence of union(unavailable)) available = available.flatMap((span) => [{ start: span.start, end: Math.min(span.end, absence.start) }, { start: Math.max(span.start, absence.end), end: span.end }].filter((item) => item.end > item.start));
  const shiftMinutes = available.reduce((sum, span) => sum + (span.end - span.start) / 60000, 0);
  const bookedMinutes = union(bookings.flatMap((booking) => available.map((span) => ({ start: Math.max(booking.start, span.start), end: Math.min(booking.end, span.end) })))).reduce((sum, span) => sum + (span.end - span.start) / 60000, 0);
  return { shiftMinutes, bookedMinutes, workloadHeadroom: shiftMinutes ? 100 * Math.max(0, 1 - bookedMinutes / shiftMinutes) : 0 };
}
export function organizationDay(instant: Date, timezone: string): Span {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const key = (timestamp: number) => { const parts = formatter.formatToParts(timestamp); return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-'); };
  const current = key(instant.getTime()); const next = new Date(`${current}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); const nextKey = next.toISOString().slice(0, 10);
  const boundary = (target: string) => { let low = instant.getTime() - 48 * 3600_000; let high = instant.getTime() + 48 * 3600_000; while (high - low > 1) { const middle = Math.floor((low + high) / 2); if (key(middle) < target) low = middle; else high = middle; } return high; };
  return { start: boundary(current), end: boundary(nextKey) };
}
export function rankingFeatures(levels: { actual: number; required: number }[], workloadHeadroom: number, resolvedVisits: number) {
  const skillDepth = levels.length ? levels.reduce((sum, item) => sum + Math.min(item.actual / item.required, 1.5) / 1.5 * 100, 0) / levels.length : 50;
  const assetFamiliarity = Math.min(100, 25 * resolvedVisits);
  const contributions = { skillDepth: .60 * skillDepth, workloadHeadroom: .25 * workloadHeadroom, assetFamiliarity: .15 * assetFamiliarity };
  return { skillDepth, workloadHeadroom, assetFamiliarity, contributions, score: Math.round((contributions.skillDepth + contributions.workloadHeadroom + contributions.assetFamiliarity) * 100) / 100 };
}
