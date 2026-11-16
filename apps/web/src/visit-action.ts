import { useRef, useState } from 'react';
import { visitActionResultSchema, type Session } from '@servicegrid/contracts';
import { api } from './api';

export function useVisitAction(session: Session, onSuccess: () => Promise<void>) {
  const pending = useRef<{ payload: string; operation: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function run(jobId: string, operation: string, body: object) {
    if (busy) return false; setBusy(true); setError('');
    const payload = JSON.stringify(body);
    if (pending.current?.payload !== payload || pending.current.operation !== operation) pending.current = { operation, payload, key: crypto.randomUUID() };
    try { visitActionResultSchema.parse(await api(`/api/v1/visits/${jobId}/${operation}`, { method: 'POST', headers: { 'Idempotency-Key': pending.current.key }, body: payload }, session)); pending.current = null; await onSuccess(); return true; }
    catch (failure) { setError(`${failure instanceof Error ? failure.message : 'The visit action failed'}. Your form is kept; retry the same action or reload to compare the latest visit.`); return false; }
    finally { setBusy(false); }
  }
  return { run, busy, error, setError };
}
