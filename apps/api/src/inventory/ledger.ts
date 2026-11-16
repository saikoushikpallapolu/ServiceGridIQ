import { Prisma, type Membership } from '@prisma/client';
import { reject } from '../auth/errors.js';

const zero = new Prisma.Decimal(0); const maximum = new Prisma.Decimal('999999999.999');
export async function applyStock(tx: Prisma.TransactionClient, actor: Membership, partId: string, locationId: string, kind: string, deltaOnHand: Prisma.Decimal, deltaReserved: Prisma.Decimal, note: string, allocationId: string | null = null, returnOfId: string | null = null) {
  const organizationId = actor.organizationId; const key = { organizationId, partId, locationId }; const balance = await tx.stockBalance.findUnique({ where: { organizationId_partId_locationId: key } }); if (!balance) return reject(409, 'STOCK_NOT_INITIALIZED', 'Record an opening receipt or physical count first');
  const ledger = await tx.stockMovement.aggregate({ where: key, _count: true, _sum: { deltaOnHand: true, deltaReserved: true } });
  if (!(ledger._sum.deltaOnHand ?? zero).equals(balance.onHand) || !(ledger._sum.deltaReserved ?? zero).equals(balance.reserved) || ledger._count !== balance.version) return reject(409, 'LEDGER_DRIFT', 'Ledger and balance differ; stop stock operations and request operator reconciliation');
  const onHand = balance.onHand.add(deltaOnHand); const reserved = balance.reserved.add(deltaReserved);
  if (onHand.isNegative() || reserved.isNegative() || reserved.gt(onHand)) return reject(409, 'INSUFFICIENT_STOCK', 'Stock cannot become negative or fall below protected allocations');
  if (onHand.gt(maximum) || reserved.gt(maximum)) return reject(409, 'STOCK_LIMIT', 'Stock quantity exceeds the supported decimal capacity');
  const updated = await tx.stockBalance.update({ where: { organizationId_partId_locationId: key, version: balance.version }, data: { onHand, reserved, version: { increment: 1 } } });
  const movement = await tx.stockMovement.create({ data: { ...key, actorMembershipId: actor.id, kind, deltaOnHand, deltaReserved, note, allocationId, returnOfId, balanceVersion: updated.version } }); return { movement, balance: updated };
}
export async function reserveRequiredParts(tx: Prisma.TransactionClient, actor: Membership, jobId: string, assignmentId: string) {
  const organizationId = actor.organizationId;
  const required = await tx.jobPart.findMany({ where: { organizationId, jobId, state: 'REQUIRED' }, orderBy: [{ partId: 'asc' }, { locationId: 'asc' }] });
  for (const part of required) { const balance = await tx.stockBalance.findUnique({ where: { organizationId_partId_locationId: { organizationId, partId: part.partId, locationId: part.locationId } } }); if (!balance || balance.onHand.sub(balance.reserved).lt(part.quantity)) return reject(409, 'INSUFFICIENT_STOCK', 'Required stock changed; reload preparation'); const allocation = await tx.stockAllocation.create({ data: { organizationId, jobId, assignmentId, jobPartId: part.id, partId: part.partId, locationId: part.locationId, quantity: part.quantity } }); await applyStock(tx, actor, part.partId, part.locationId, 'RESERVE', zero, part.quantity, 'Required parts allocated by approved assignment.', allocation.id); }
}
export async function releaseStock(tx: Prisma.TransactionClient, actor: Membership, assignmentId: string, reason: string) {
  const rows = await tx.stockAllocation.findMany({ where: { organizationId: actor.organizationId, assignmentId, state: 'ACTIVE' }, orderBy: [{ partId: 'asc' }, { locationId: 'asc' }] });
  for (const row of rows) { const remaining = row.quantity.sub(row.consumed); await applyStock(tx, actor, row.partId, row.locationId, 'RELEASE', zero, remaining.negated(), reason.slice(0, 2000), row.id); await tx.stockAllocation.update({ where: { id: row.id }, data: { state: 'RELEASED' } }); }
}
export async function reconcileStock(tx: Prisma.TransactionClient, organizationId: string) {
  const balances = await tx.stockBalance.findMany({ where: { organizationId }, take: 5001 }); if (balances.length > 5000) return reject(400, 'RECONCILIATION_LIMIT', 'More than 5,000 stock pairs require operator-assisted reconciliation');
  const totals = await tx.stockMovement.groupBy({ by: ['partId', 'locationId'], where: { organizationId }, _sum: { deltaOnHand: true, deltaReserved: true }, _count: true });
  const allocations = await tx.stockAllocation.groupBy({ by: ['partId', 'locationId'], where: { organizationId, state: 'ACTIVE' }, _sum: { quantity: true, consumed: true } });
  const issues = balances.flatMap((balance) => { const ledger = totals.find((row) => row.partId === balance.partId && row.locationId === balance.locationId); const active = allocations.find((row) => row.partId === balance.partId && row.locationId === balance.locationId); const onHand = ledger?._sum.deltaOnHand ?? zero; const reserved = ledger?._sum.deltaReserved ?? zero; const protectedQuantity = (active?._sum.quantity ?? zero).sub(active?._sum.consumed ?? zero); return balance.onHand.equals(onHand) && balance.reserved.equals(reserved) && balance.reserved.equals(protectedQuantity) && balance.version === (ledger?._count ?? 0) ? [] : [{ partId: balance.partId, locationId: balance.locationId, storedOnHand: balance.onHand.toString(), ledgerOnHand: onHand.toString(), storedReserved: balance.reserved.toString(), ledgerReserved: reserved.toString(), allocatedRemaining: protectedQuantity.toString(), balanceVersion: balance.version, movementCount: ledger?._count ?? 0 }]; });
  return { checkedAt: new Date().toISOString(), balancesChecked: balances.length, consistent: issues.length === 0, issues };
}
