import { describe, expect, it } from 'vitest';
import { appointment, evaluateTechnician, overlaps } from './policy.js';

const date = (time: string) => new Date(`2030-01-01T${time}:00Z`);
const slot = appointment(date('09:00'), 90, 30);
const base = () => ({ active: true, membershipActive: true, safetyRestricted: false, branchId: 'main', policy: { branchId: 'main', allowCrossBranch: false, requirements: [{ skillId: 'cooling', level: 2 }] }, skills: [{ skillId: 'cooling', level: 2, active: true, expiresAt: null as Date | null, verifiedAt: date('00:00') }], availability: [{ kind: 'SHIFT' as const, startsAt: date('08:30'), endsAt: date('10:30') }], reservations: [] as { reservedFrom: Date; endsAt: Date }[], slot, now: date('08:00') });
describe('appointment and hard eligibility policies', () => {
  it('includes travel before arrival and allows work beyond an arrival window', () => { expect(slot.reservedFrom).toEqual(date('08:30')); expect(slot.endsAt).toEqual(date('10:30')); expect(evaluateTechnician(base()).eligible).toBe(true); });
  it('uses half-open overlaps so adjacent appointments are allowed', () => { expect(overlaps({ startsAt: date('08:00'), endsAt: date('08:30') }, { startsAt: slot.reservedFrom, endsAt: slot.endsAt })).toBe(false); expect(overlaps({ startsAt: date('08:00'), endsAt: date('08:31') }, { startsAt: slot.reservedFrom, endsAt: slot.endsAt })).toBe(true); });
  it('fails insufficient, revoked, missing and mid-appointment expired qualifications', () => {
    for (const skills of [[], [{ ...base().skills[0]!, level: 1 }], [{ ...base().skills[0]!, active: false }], [{ ...base().skills[0]!, expiresAt: date('10:29') }]]) expect(evaluateTechnician({ ...base(), skills }).eligible).toBe(false);
    expect(evaluateTechnician({ ...base(), skills: [{ ...base().skills[0]!, expiresAt: date('10:30') }] }).eligible).toBe(true);
  });
  it('requires coverage for the travel buffer and does not merge adjacent shifts', () => {
    expect(evaluateTechnician({ ...base(), availability: [{ kind: 'SHIFT', startsAt: date('09:00'), endsAt: date('12:00') }] }).eligible).toBe(false);
    expect(evaluateTechnician({ ...base(), availability: [{ kind: 'SHIFT', startsAt: date('08:00'), endsAt: date('09:30') }, { kind: 'SHIFT', startsAt: date('09:30'), endsAt: date('12:00') }] }).eligible).toBe(false);
  });
  it('explains branch, safety, access, unavailability and reservation blockers independently', () => {
    const result = evaluateTechnician({ ...base(), branchId: 'annex', safetyRestricted: true, membershipActive: false, availability: [...base().availability, { kind: 'UNAVAILABLE', startsAt: date('08:45'), endsAt: date('09:00') }], reservations: [{ reservedFrom: date('10:00'), endsAt: date('11:00') }] });
    expect(result.checks.filter((item) => !item.passed).map((item) => item.code)).toEqual(['ACTIVE_ACCESS', 'SAFETY', 'BRANCH', 'UNAVAILABLE', 'RESERVATION']);
    expect(evaluateTechnician({ ...base(), branchId: 'annex', policy: { ...base().policy, allowCrossBranch: true } }).eligible).toBe(true);
  });
});
