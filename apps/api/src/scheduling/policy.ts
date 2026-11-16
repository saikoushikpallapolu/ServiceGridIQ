export type Interval = { startsAt: Date; endsAt: Date };
export const overlaps = (a: Interval, b: Interval) => a.startsAt < b.endsAt && b.startsAt < a.endsAt;
export function appointment(plannedStart: Date, duration: number, buffer: number) {
  return { plannedStart, reservedFrom: new Date(plannedStart.getTime() - buffer * 60_000), endsAt: new Date(plannedStart.getTime() + duration * 60_000) };
}
export function evaluateTechnician(input: {
  active: boolean; membershipActive: boolean; safetyRestricted: boolean; branchId: string;
  policy: { branchId: string; allowCrossBranch: boolean; requirements: { skillId: string; level: number; name?: string }[] };
  skills: { skillId: string; level: number; active: boolean; expiresAt: Date | null; verifiedAt: Date }[];
  availability: (Interval & { kind: 'SHIFT' | 'UNAVAILABLE' })[];
  reservations: { reservedFrom: Date; endsAt: Date }[];
  slot: ReturnType<typeof appointment>; now: Date;
}) {
  const occupied = { startsAt: input.slot.reservedFrom, endsAt: input.slot.endsAt };
  const check = (code: string, passed: boolean, message: string) => ({ code, passed, message });
  const qualificationChecks = input.policy.requirements.map((required) => {
    const passed = input.skills.some((skill) => skill.skillId === required.skillId && skill.active && skill.level >= required.level && skill.verifiedAt <= input.now && (!skill.expiresAt || (skill.expiresAt > input.now && skill.expiresAt >= input.slot.endsAt)));
    return check(`SKILL:${required.skillId}`, passed, `${required.name ?? 'Required skill'}: owner-verified level ${required.level} or higher must remain valid through work end.`);
  });
  const qualified = qualificationChecks.every((item) => item.passed);
  const checks = [
    check('ACTIVE_ACCESS', input.active && input.membershipActive, 'Active technician profile, user and technician membership are required.'),
    check('SAFETY', !input.safetyRestricted, 'A recorded safety restriction blocks eligibility.'),
    check('BRANCH', input.branchId === input.policy.branchId || input.policy.allowCrossBranch, input.policy.allowCrossBranch ? 'This job explicitly permits other company branches.' : 'Technician must belong to the job’s service branch.'),
    check('QUALIFICATIONS', qualified, 'Every required skill must meet its level and remain owner-verified and unexpired through the work end.'),
    check('SHIFT', input.availability.some((block) => block.kind === 'SHIFT' && block.startsAt <= occupied.startsAt && block.endsAt >= occupied.endsAt), 'One shift must cover travel buffer and the whole appointment; overtime is disabled.'),
    check('UNAVAILABLE', !input.availability.some((block) => block.kind === 'UNAVAILABLE' && overlaps(block, occupied)), 'Travel and work must not overlap an unavailable interval.'),
    check('RESERVATION', !input.reservations.some((block) => overlaps({ startsAt: block.reservedFrom, endsAt: block.endsAt }, occupied)), 'Travel and work must not overlap an active reservation.'),
    ...qualificationChecks,
  ];
  return { eligible: checks.every((item) => item.passed), checks };
}
