import type { PrismaClient } from '@prisma/client';

// Fictional local fixtures only. Existing profiles, qualifications and revocations are preserved.
export async function seedScheduling(db: PrismaClient, organizations: string[]) {
  for (const [index, organizationId] of organizations.entries()) {
    const suffix = String(index + 1).padStart(3, '0');
    const id = (prefix: number, tail = suffix) => `${prefix}0000000-0000-4000-8000-000000000${tail}`;
    const owner = await db.membership.findFirst({ where: { organizationId, role: 'OWNER', active: true, user: { active: true } } });
    if (!owner) continue;
    const branch = await db.branch.upsert({ where: { id: id(6) }, create: { id: id(6), organizationId, name: 'Fictional Main Branch', nameKey: 'fictional main branch', address: '100 Fictional Street' }, update: {} });
    const annex = await db.branch.upsert({ where: { id: id(6, `01${index + 1}`) }, create: { id: id(6, `01${index + 1}`), organizationId, name: 'Fictional Annex', nameKey: 'fictional annex', address: '200 Fictional Street' }, update: {} });
    const skill = await db.skill.upsert({ where: { id: id(7) }, create: { id: id(7), organizationId, name: 'Fictional cooling diagnostics', nameKey: 'fictional cooling diagnostics' }, update: {} });
    let member = index === 0 ? await db.membership.findFirst({ where: { organizationId, role: 'TECHNICIAN', active: true, user: { email: 'technician.alpha@example.test', active: true } } }) : null;
    if (!member && index !== 0) {
      const user = await db.user.upsert({ where: { issuer_subject: { issuer: 'https://fictional.invalid', subject: `demo-tech-${suffix}` } }, create: { issuer: 'https://fictional.invalid', subject: `demo-tech-${suffix}`, email: `demo-tech-${suffix}@example.test`, name: 'Fictional Beta Technician' }, update: {} });
      member = await db.membership.upsert({ where: { organizationId_userId: { organizationId, userId: user.id } }, create: { organizationId, userId: user.id, role: 'TECHNICIAN' }, update: {} });
    }
    if (member) {
      const existingProfile = await db.technician.findUnique({ where: { membershipId: member.id } });
      const tech = await db.technician.upsert({ where: { membershipId: member.id }, create: { id: id(8), organizationId, membershipId: member.id, branchId: branch.id }, update: {} });
      await db.technicianSkill.upsert({ where: { organizationId_technicianId_skillId: { organizationId, technicianId: tech.id, skillId: skill.id } }, create: { organizationId, technicianId: tech.id, skillId: skill.id, level: 2, verifiedByMembershipId: owner.id, evidence: 'Fictional local seed evidence; not a real-world certification.' }, update: {} });
      if (!existingProfile) await db.availability.upsert({ where: { id: id(9) }, create: { id: id(9), organizationId, technicianId: tech.id, kind: 'SHIFT', startsAt: new Date('2026-12-01T02:00:00Z'), endsAt: new Date('2026-12-01T12:00:00Z'), reason: 'Fictional demo shift' }, update: {} });
    }
    const backupUser = await db.user.upsert({ where: { issuer_subject: { issuer: 'https://fictional.invalid', subject: `backup-${suffix}` } }, create: { issuer: 'https://fictional.invalid', subject: `backup-${suffix}`, email: `backup-${suffix}@example.test`, name: 'Fictional Annex Technician' }, update: {} });
    const backupMember = await db.membership.upsert({ where: { organizationId_userId: { organizationId, userId: backupUser.id } }, create: { organizationId, userId: backupUser.id, role: 'TECHNICIAN' }, update: {} });
    const existingBackup = await db.technician.findUnique({ where: { membershipId: backupMember.id } });
    const backup = await db.technician.upsert({ where: { membershipId: backupMember.id }, create: { id: id(8, `01${index + 1}`), organizationId, membershipId: backupMember.id, branchId: annex.id }, update: {} });
    if (!existingBackup) await db.availability.upsert({ where: { id: id(9, `01${index + 1}`) }, create: { id: id(9, `01${index + 1}`), organizationId, technicianId: backup.id, kind: 'SHIFT', startsAt: new Date('2026-12-01T02:00:00Z'), endsAt: new Date('2026-12-01T12:00:00Z'), reason: 'Fictional annex shift; no verified qualification' }, update: {} });
    const jobId = `50000000-0000-4000-8000-000000000${suffix}`;
    if (!await db.jobScheduling.findUnique({ where: { jobId } })) {
      await db.$transaction(async (tx) => {
        const policy = await tx.jobScheduling.create({ data: { organizationId, jobId, branchId: branch.id } });
        await tx.jobSkillRequirement.create({ data: { organizationId, schedulingId: policy.id, skillId: skill.id, level: 2 } });
        const job = await tx.job.update({ where: { id: jobId }, data: { version: { increment: 1 } } });
        await tx.jobEvent.create({ data: { organizationId, jobId, actorMembershipId: owner.id, kind: 'DEMO_SCHEDULING_SEEDED', note: 'Fictional branch and qualification requirements seeded.', details: { version: job.version, source: 'local-seed' } } });
      });
    }
  }
}
