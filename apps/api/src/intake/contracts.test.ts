import { describe, expect, it } from 'vitest';
import { customerInputSchema, customerSchema, jobInputSchema, jobSchema, validArrivalWindow } from '@servicegrid/contracts';

describe('intake transport contracts', () => {
  it('rejects server-managed request fields but accepts and strips response metadata', () => {
    const input = { name: 'Fictional', email: null, phone: null };
    expect(customerInputSchema.safeParse({ ...input, organizationId: 'forged' }).success).toBe(false);
    const response = customerSchema.parse({ ...input, id: '20000000-0000-4000-8000-000000000001', version: 1, createdAt: '2026-11-16T00:00:00.000Z', updatedAt: '2026-11-16T00:00:00.000Z', organizationId: '00000000-0000-4000-8000-000000000001' });
    expect(response).not.toHaveProperty('organizationId');
  });
  it('accepts serialized job responses and rejects status injection on intake', () => {
    const input = { customerId: '20000000-0000-4000-8000-000000000001', siteId: '30000000-0000-4000-8000-000000000001', equipmentId: '40000000-0000-4000-8000-000000000001', complaint: 'Demo', priority: 'NORMAL', arrivalStart: '2026-12-01T09:00:00Z', arrivalEnd: '2026-12-01T12:00:00Z', estimatedDurationMinutes: 60, travelBufferMinutes: 30 };
    expect(jobInputSchema.safeParse({ ...input, status: 'TRIAGED' }).success).toBe(false);
    expect(jobSchema.parse({ ...input, status: 'DRAFT', id: '50000000-0000-4000-8000-000000000001', version: 1, createdAt: input.arrivalStart, updatedAt: input.arrivalStart, organizationId: 'metadata' }).status).toBe('DRAFT');
  });
  it('compares arrival instants across offsets and enforces a positive seven-day maximum', () => {
    expect(validArrivalWindow({ arrivalStart: '2026-12-01T10:00:00+05:30', arrivalEnd: '2026-12-01T05:00:00Z' })).toBe(true);
    expect(validArrivalWindow({ arrivalStart: '2026-12-01T10:00:00Z', arrivalEnd: '2026-12-01T10:00:00Z' })).toBe(false);
    expect(validArrivalWindow({ arrivalStart: '2026-12-01T10:00:00Z', arrivalEnd: '2026-12-08T10:00:00Z' })).toBe(true);
    expect(validArrivalWindow({ arrivalStart: '2026-12-01T10:00:00Z', arrivalEnd: '2026-12-08T10:00:01Z' })).toBe(false);
  });
});
