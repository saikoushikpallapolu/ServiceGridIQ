import { describe, expect, it } from 'vitest';
import { confirmationCurrent, organizationDay, overallReadiness, rankingFeatures, workload, type Check } from './policy.js';

const now = new Date('2030-01-01T00:00:00Z'); const plannedStart = new Date('2030-01-02T09:00:00Z');
describe('readiness evidence and deterministic ranking', () => {
  it('expires confirmations exactly at TTL and rejects changed quantity/location or visit revisions', () => {
    const input = { revision: 2, visitRevision: 3, plannedStart, hours: 24, now, confirmation: { requirementRevision: 2, visitRevision: 3, plannedStart, confirmedAt: new Date(now.getTime() - 23 * 3600000), status: 'CONFIRMED' } };
    expect(confirmationCurrent(input)).toBe(true);
    expect(confirmationCurrent({ ...input, now: new Date(now.getTime() + 3600000) })).toBe(false);
    expect(confirmationCurrent({ ...input, revision: 3 })).toBe(false);
    expect(confirmationCurrent({ ...input, visitRevision: 4 })).toBe(false);
    expect(confirmationCurrent({ ...input, confirmation: { ...input.confirmation, confirmedAt: new Date(now.getTime() + 1) } })).toBe(false);
  });
  it('never overrides unknown blockers and requires acknowledgment for warnings', () => {
    const check: Check = { code: 'PART', status: 'UNKNOWN', severity: 'BLOCKER', message: 'Required part', evidenceId: null, verifiedBy: null, verifiedAt: null, acknowledged: true };
    expect(overallReadiness([check])).toBe('BLOCKED');
    expect(overallReadiness([{ ...check, severity: 'WARNING', acknowledged: false }])).toBe('NEEDS_REVIEW');
    expect(overallReadiness([{ ...check, severity: 'WARNING' }])).toBe('READY');
  });
  it('unions overlapping shifts/bookings and subtracts unavailability before workload scoring', () => {
    const result = workload([{ start: 0, end: 120 * 60000 }, { start: 60 * 60000, end: 180 * 60000 }], [{ start: 0, end: 30 * 60000 }], [{ start: 30 * 60000, end: 90 * 60000 }, { start: 60 * 60000, end: 120 * 60000 }], { start: 0, end: 180 * 60000 });
    expect(result).toEqual({ shiftMinutes: 150, bookedMinutes: 90, workloadHeadroom: 40 });
  });
  it('computes local service dates across 23- and 25-hour daylight-saving days', () => {
    const spring = organizationDay(new Date('2030-03-10T12:00:00Z'), 'America/New_York');
    const fall = organizationDay(new Date('2030-11-03T12:00:00Z'), 'America/New_York');
    expect((spring.end - spring.start) / 3600000).toBe(23); expect((fall.end - fall.start) / 3600000).toBe(25);
    const india = organizationDay(new Date('2030-01-01T01:00:00Z'), 'Asia/Kolkata'); expect(new Date(india.start).toISOString()).toBe('2029-12-31T18:30:00.000Z');
  });
  it('uses published weights, no-history zero and a neutral general-inspection skill value', () => {
    expect(rankingFeatures([{ actual: 3, required: 2 }], 80, 4)).toMatchObject({ skillDepth: 100, assetFamiliarity: 100, score: 95 });
    expect(rankingFeatures([], 100, 0)).toMatchObject({ skillDepth: 50, assetFamiliarity: 0, score: 55 });
  });
});
