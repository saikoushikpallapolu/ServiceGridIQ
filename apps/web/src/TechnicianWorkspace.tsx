import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { myAssignmentSchema, visitCardSchema, type Session, type VisitCard } from '@servicegrid/contracts';
import { api, ApiError } from './api';
import { useVisitAction } from './visit-action';
import { useUnsavedChanges } from './unsaved';
import { CloseVisitForm, ObservationForm, VisitSummary } from './VisitForms';

export function TechnicianWorkspace({ session }: { session: Session }) {
  const [scope, setScope] = useState('ACTIVE'); const [query, setQuery] = useState(''); const [search, setSearch] = useState(''); const [page, setPage] = useState(1);
  const [items, setItems] = useState<z.infer<typeof myAssignmentSchema>[]>([]); const [total, setTotal] = useState(0); const [visit, setVisit] = useState<VisitCard | null>(null); const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [dirty, setDirty] = useState(false); const [mode, setMode] = useState<'observation' | 'close'>('observation'); const [formEpoch, setFormEpoch] = useState(0);
  useUnsavedChanges(dirty);
  const loadList = useCallback(async () => { const result = z.object({ items: z.array(myAssignmentSchema), total: z.number() }).parse(await api(`/api/v1/my-assignments?${new URLSearchParams({ scope, q: search, page: String(page), limit: '10' })}`, {}, session)); setItems(result.items); setTotal(result.total); }, [session, scope, search, page]);
  useEffect(() => { setLoading(true); setLoadError(''); void loadList().catch((failure: unknown) => setLoadError(failure instanceof Error ? failure.message : 'Could not load visits')).finally(() => setLoading(false)); }, [loadList]);
  async function open(id: string) { setLoadError(''); try { setVisit(visitCardSchema.parse(await api(`/api/v1/my-assignments/${id}`, {}, session))); setSelected(id); } catch (failure) { if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) { setVisit(null); setSelected(''); } setLoadError(failure instanceof Error ? failure.message : 'Could not open visit'); } }
  const action = useVisitAction(session, async () => { setDirty(false); setFormEpoch((value) => value + 1); await loadList(); if (selected) await open(selected); });
  const discard = () => !dirty || window.confirm('Discard unsaved visit notes?');
  const body = () => ({ version: visit!.job.version, assignmentId: visit!.assignment.id });
  function switchMode(next: 'observation' | 'close') { if (!discard()) return; setDirty(false); setMode(next); setFormEpoch((value) => value + 1); }
  return <section className="status-panel technician-workspace" aria-labelledby="my-visits-title"><p className="eyebrow">TECHNICIAN WORKSPACE</p><h2 id="my-visits-title">My service visits</h2><p className="field-help">Only your authorized assignments appear here. This workspace needs a network connection; unsaved forms are kept on request failure.</p>
    <form className="queue-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query); }}><label>Visit list<select aria-label="Visit list" value={scope} onChange={(event) => { setScope(event.target.value); setPage(1); }}><option value="ACTIVE">Active assignments</option><option value="HISTORY">Closed and cancelled visits</option></select></label><label>Search my visits<input value={query} maxLength={160} onChange={(event) => setQuery(event.target.value)} /></label><button>Search visits</button></form>
    {loadError && <p className="notice failure" role="alert">{loadError}</p>}{action.error && <p className="notice failure" role="alert">{action.error}</p>}
    <button disabled={action.busy} onClick={() => { if (!discard()) return; setDirty(false); setFormEpoch((value) => value + 1); void loadList().then(() => selected ? open(selected) : undefined).catch((failure: unknown) => setLoadError(failure instanceof Error ? failure.message : 'Could not refresh')); }}>Reload my visits</button>
    {loading ? <p role="status">Loading assigned visits…</p> : items.length ? <div className="job-list visit-list">{items.map((item) => <button className="job-card visit-card" key={item.assignmentId} onClick={() => { if (!discard()) return; setDirty(false); setMode('observation'); setFormEpoch((value) => value + 1); void open(item.assignmentId); }}><div><strong>{item.customerName}</strong><span>{item.complaint}</span><small>{item.jobType === 'FOLLOW_UP' ? 'Follow-up' : 'Initial'} · {new Date(item.plannedStart).toLocaleString()}</small></div><span className="job-state">{item.status}</span></button>)}</div> : <p>No visits match this list. Ask your dispatcher to approve an assignment.</p>}
    <div className="pagination"><span>{total} visits · Page {page}</span><button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous visits</button><button disabled={page * 10 >= total || loading} onClick={() => setPage((value) => value + 1)}>Next visits</button></div>
    {visit && <section className="technician-visit-detail" aria-label="My visit details"><VisitSummary visit={visit} />
      {visit.job.status === 'ASSIGNED' && visit.assignment.active && <button className="primary-action" disabled={action.busy} onClick={() => void action.run(visit.job.id, 'acknowledge', body())}>Acknowledge preparation</button>}
      {visit.job.status === 'ACKNOWLEDGED' && visit.assignment.active && <button className="primary-action" disabled={action.busy} onClick={() => void action.run(visit.job.id, 'start', body())}>Start visit</button>}
      {['IN_PROGRESS', 'CLOSED'].includes(visit.job.status) && <><div className="record-actions"><button onClick={() => switchMode('observation')}>Record findings</button>{visit.job.status === 'IN_PROGRESS' && <button onClick={() => switchMode('close')}>Close visit form</button>}</div>{dirty && <p className="unsaved-notice" role="status">Unsaved visit changes</p>}{mode === 'close' && visit.job.status === 'IN_PROGRESS' ? <CloseVisitForm key={`close-${selected}-${formEpoch}`} busy={action.busy} onDirty={() => setDirty(true)} onSave={async (data) => { await action.run(visit.job.id, 'close', { ...body(), ...data }); }} /> : <ObservationForm key={`observation-${selected}-${formEpoch}`} visit={visit} busy={action.busy} onDirty={() => setDirty(true)} onSave={async (data) => { await action.run(visit.job.id, 'observations', { ...body(), ...data }); }} />}</>}
    </section>}
  </section>;
}
