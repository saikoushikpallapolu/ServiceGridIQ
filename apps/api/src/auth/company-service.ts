import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient, Membership, Role, User } from '@prisma/client';
import { reject } from './errors.js';

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

// Organization-scoped domain mutations own their authorization recheck,
// concurrency control, and audit write. Controllers only validate transport.
export function createCompanyService(database: PrismaClient) {
  return {
    async updateMembership(actor: Membership, membershipId: string, change: { role: Role; active: boolean }) {
      await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId}::uuid FOR UPDATE`;
        const authorized = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: actor.id } } });
        if (!authorized?.active || authorized.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Owner access required');
        const target = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: membershipId } } });
        if (!target) return reject(404, 'NOT_FOUND', 'Resource not found');
        if (target.active && target.role === 'OWNER' && (!change.active || change.role !== 'OWNER')) {
          const owners = await tx.membership.count({ where: { organizationId: actor.organizationId, active: true, role: 'OWNER' } });
          if (owners <= 1) return reject(409, 'LAST_OWNER', 'Keep at least one active owner');
        }
        await tx.membership.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: target.id } }, data: change });
        await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.id, action: 'MEMBERSHIP_UPDATED', targetId: target.id, details: { before: { role: target.role, active: target.active }, after: change } } });
      });
    },
    async invite(actor: Membership, input: { email: string; role: Role }) {
      const token = randomBytes(32).toString('base64url');
      const invitation = await database.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId}::uuid FOR UPDATE`;
        const authorized = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: actor.organizationId, id: actor.id } } });
        if (!authorized?.active || authorized.role !== 'OWNER') return reject(403, 'FORBIDDEN', 'Owner access required');
        const member = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, active: true, user: { email: input.email } } });
        if (member) return reject(409, 'ALREADY_MEMBER', 'That person already belongs to this company');
        await tx.invitation.deleteMany({ where: { organizationId: actor.organizationId, email: input.email, acceptedAt: null } });
        const item = await tx.invitation.create({ data: { organizationId: actor.organizationId, createdByMembershipId: actor.id, tokenHash: digest(token), ...input, expiresAt: new Date(Date.now() + 72 * 60 * 60_000) } });
        await tx.auditEvent.create({ data: { organizationId: actor.organizationId, actorMembershipId: actor.id, action: 'INVITATION_CREATED', targetId: item.id, details: { role: item.role } } });
        return item;
      });
      return { id: invitation.id, expiresAt: invitation.expiresAt, token };
    },
    async acceptInvitation(user: User, token: string) {
      await database.$transaction(async (tx) => {
        const invitation = await tx.invitation.findUnique({ where: { tokenHash: digest(token) }, include: { organization: true } });
        if (!invitation || !invitation.organization.active || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now() || invitation.email !== user.email) return reject(404, 'NOT_FOUND', 'Invitation not found or no longer available');
        await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${invitation.organizationId}::uuid FOR UPDATE`;
        const creator = await tx.membership.findUnique({ where: { organizationId_id: { organizationId: invitation.organizationId, id: invitation.createdByMembershipId } }, include: { user: true } });
        if (!creator?.active || !creator.user.active || creator.role !== 'OWNER') return reject(404, 'NOT_FOUND', 'Invitation no longer available');
        const existing = await tx.membership.findUnique({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } } });
        if (existing?.active) return reject(409, 'ALREADY_MEMBER', 'You already belong to this company');
        const accepted = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date() } });
        if (!accepted.count) return reject(409, 'INVITATION_USED', 'Invitation no longer available');
        const membership = await tx.membership.upsert({ where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } }, create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role }, update: { role: invitation.role, active: true } });
        await tx.auditEvent.create({ data: { organizationId: invitation.organizationId, actorMembershipId: membership.id, action: 'INVITATION_ACCEPTED', targetId: invitation.id, details: {} } });
      });
    },
  };
}
