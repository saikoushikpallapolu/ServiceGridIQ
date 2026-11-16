import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { customerSchema, siteSchema, equipmentSchema, jobSummarySchema, jobDetailSchema, jobInputSchema, validArrivalWindow, type Customer, type Site, type Equipment, type JobDetail, type JobSummary, type Session } from '@servicegrid/contracts';
import { api, ApiError } from './api';
import { JobEligibility } from './JobEligibility';
import { DispatchPreparation } from './DispatchPreparation';

const localTime = (value: string) => { const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };
const instant = (value: FormDataEntryValue | null) => new Date(String(value)).toISOString();
const list = <T,>(schema: z.ZodType<T>) => z.object({ items: z.array(schema), total: z.number(), page: z.number(), limit: z.number() });
const when = (value: string) => new Date(value).toLocaleString();

export function Intake({ session }: { session: Session }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [equipmentId, setEquipmentId] = useState('');
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [panel, setPanel] = useState<'queue' | 'intake' | 'records'>('queue');
  const [recordEdit, setRecordEdit] = useState<'customer' | 'site' | 'equipment' | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [catalogRevision, setCatalogRevision] = useState(0);
  const selectedCustomer = customers.find((item) => item.id === customerId);
  const selectedSite = sites.find((item) => item.id === siteId);
  const selectedEquipment = equipment.find((item) => item.id === equipmentId);
  const refresh = () => setRevision((value) => value + 1);
  const refreshCatalog = () => { setCatalogRevision((value) => value + 1); refresh(); };

  const loadQueue = useCallback(async () => {
    const filters = new URLSearchParams({ page: String(page), limit: '10', ...(status ? { status } : {}), ...(priority ? { priority } : {}), ...(search ? { q: search } : {}) });
    return list(jobSummarySchema).parse(await api(`/api/v1/jobs?${filters}`, {}, session));
  }, [session, page, status, priority, search]);
  useEffect(() => {
    let active = true; setLoading(true);
    void loadQueue().then((result) => { if (active) { setJobs(result.items); setTotal(result.total); } }).catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load the job queue'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadQueue, revision]);
  useEffect(() => {
    let active = true;
    // Pickers load all pages, instead of silently hiding records beyond the first page.
    void (async () => {
      const items: Customer[] = []; let page = 1; let total = 1;
      while (items.length < total) { const result = list(customerSchema).parse(await api(`/api/v1/customers?page=${page++}&limit=100`, {}, session)); items.push(...result.items); total = result.total; if (!result.items.length) break; }
      if (active) setCustomers(items);
    })().catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load customers'); });
    return () => { active = false; };
  }, [session, catalogRevision]);
  useEffect(() => {
    let active = true; setSites([]); setEquipment([]);
    if (customerId) void (async () => {
      const items: Site[] = []; let page = 1; let total = 1;
      while (items.length < total) { const result = list(siteSchema).parse(await api(`/api/v1/sites?customerId=${customerId}&page=${page++}&limit=100`, {}, session)); items.push(...result.items); total = result.total; if (!result.items.length) break; }
      if (active) setSites(items);
    })().catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load sites'); });
    return () => { active = false; };
  }, [customerId, session, catalogRevision]);
  useEffect(() => {
    let active = true; setEquipment([]);
    if (siteId) void (async () => {
      const items: Equipment[] = []; let page = 1; let total = 1;
      while (items.length < total) { const result = list(equipmentSchema).parse(await api(`/api/v1/equipment?siteId=${siteId}&page=${page++}&limit=100`, {}, session)); items.push(...result.items); total = result.total; if (!result.items.length) break; }
      if (active) setEquipment(items);
    })().catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : 'Could not load equipment'); });
    return () => { active = false; };
  }, [siteId, session, catalogRevision]);

  async function act(work: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(''); setMessage('');
    try { await work(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The request failed'); if (failure instanceof ApiError && failure.status === 409) setMessage('Your form has been kept. Reload the latest record and compare your changes.'); }
    finally { setBusy(false); }
  }
  async function openJob(id: string) { setDetail(jobDetailSchema.parse(await api(`/api/v1/jobs/${id}`, {}, session))); setEditing(false); }
  function changeCustomer(id: string) { setCustomerId(id); setSiteId(''); setEquipmentId(''); setRecordEdit(null); }
  function changeSite(id: string) { setSiteId(id); setEquipmentId(''); setRecordEdit(null); }
  const pickers = <div className="intake-grid">
    <label>Customer<select aria-label="Intake customer" required value={customerId} onChange={(event) => changeCustomer(event.target.value)}><option value="">Select customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Service site<select aria-label="Intake site" required value={siteId} onChange={(event) => changeSite(event.target.value)} disabled={!customerId}><option value="">Select site</option>{sites.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label>Equipment<select aria-label="Intake equipment" required value={equipmentId} onChange={(event) => { setEquipmentId(event.target.value); setRecordEdit(null); }} disabled={!siteId}><option value="">Select equipment</option>{equipment.map((item) => <option value={item.id} key={item.id}>{item.manufacturer} {item.model} · {item.serialNumber}</option>)}</select></label>
  </div>;
  function saveRecord(kind: 'customer' | 'site' | 'equipment', event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const current = recordEdit === kind ? kind === 'customer' ? selectedCustomer : kind === 'site' ? selectedSite : selectedEquipment : undefined;
    const resource = kind === 'customer' ? 'customers' : kind === 'site' ? 'sites' : 'equipment';
    const input = kind === 'customer' ? { name: data.get('name'), email: data.get('email') || null, phone: data.get('phone') || null }
      : kind === 'site' ? { name: data.get('name'), address: data.get('address'), accessNotes: data.get('accessNotes'), ...(!current ? { customerId } : {}) }
      : { manufacturer: data.get('manufacturer'), model: data.get('model'), serialNumber: data.get('serialNumber'), notes: data.get('notes'), ...(!current ? { siteId } : {}) };
    void act(async () => {
      const result = await api(`/api/v1/${resource}${current ? `/${current.id}` : ''}`, { method: current ? 'PATCH' : 'POST', body: JSON.stringify({ ...input, ...(current ? { version: current.version } : {}) }) }, session);
      if (kind === 'customer') { const row = customerSchema.parse(result); setCustomers((rows) => [...rows.filter((item) => item.id !== row.id), row]); if (!current) changeCustomer(row.id); }
      if (kind === 'site') { const row = siteSchema.parse(result); setSites((rows) => [...rows.filter((item) => item.id !== row.id), row]); if (!current) changeSite(row.id); }
      if (kind === 'equipment') { const row = equipmentSchema.parse(result); setEquipment((rows) => [...rows.filter((item) => item.id !== row.id), row]); if (!current) setEquipmentId(row.id); }
      setRecordEdit(null); form.reset(); refreshCatalog(); setMessage(`${kind[0]!.toUpperCase() + kind.slice(1)} ${current ? 'updated' : 'created'}.`);
    });
  }
  function saveJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void act(async () => {
      const input = jobInputSchema.parse({ customerId: editing ? detail!.customerId : customerId, siteId: editing ? detail!.siteId : siteId, equipmentId: editing ? detail!.equipmentId : equipmentId,
        complaint: data.get('complaint'), serviceCategory: data.get('serviceCategory'), priority: data.get('priority'), arrivalStart: instant(data.get('arrivalStart')), arrivalEnd: instant(data.get('arrivalEnd')),
        estimatedDurationMinutes: Number(data.get('duration')), travelBufferMinutes: Number(data.get('buffer')) });
      if (!validArrivalWindow(input)) throw new Error('Arrival end must follow start, within seven days.');
      const result = z.object({ id: z.uuid() }).parse(await api(`/api/v1/jobs${editing ? `/${detail!.id}` : ''}`, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ ...input, ...(editing ? { version: detail!.version } : {}) }) }, session));
      await openJob(result.id); setPanel('queue'); refresh(); setMessage(editing ? 'Draft updated.' : 'Service request created as a draft.');
    });
  }
  const jobForm = (job?: JobDetail) => <form key={job ? `${job.id}-${job.version}` : 'new-job'} onSubmit={saveJob} className="intake-form">
    {!job && pickers}
    {job && <p>Equipment: {job.equipment.manufacturer} {job.equipment.model} · {job.equipment.serialNumber}</p>}
    <label>Service category<input name="serviceCategory" required maxLength={120} defaultValue={job?.serviceCategory ?? 'GENERAL_SERVICE'} /></label>
    <label>Complaint<textarea aria-label="Complaint" name="complaint" required maxLength={4000} defaultValue={job?.complaint} rows={3} /></label>
    <div className="intake-grid"><label>Priority<select name="priority" defaultValue={job?.priority ?? 'NORMAL'}>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Arrival window start<input type="datetime-local" name="arrivalStart" required defaultValue={job ? localTime(job.arrivalStart) : ''} /></label>
      <label>Arrival window end<input type="datetime-local" name="arrivalEnd" required defaultValue={job ? localTime(job.arrivalEnd) : ''} /></label></div>
    <p className="field-help">Times use this browser’s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). This is the customer arrival window, not a booked technician appointment.</p>
    <div className="intake-grid"><label>Estimated work duration (minutes)<input type="number" name="duration" required min={15} max={1440} defaultValue={job?.estimatedDurationMinutes ?? 60} /></label><label>Travel buffer (minutes)<input type="number" name="buffer" required min={0} max={480} defaultValue={job?.travelBufferMinutes ?? 30} /></label></div>
    <button type="submit" disabled={busy || (!job && !equipmentId)}>{job ? 'Save draft changes' : 'Create service request'}</button>
  </form>;

  return <section className="status-panel intake-panel" aria-labelledby="intake-title">
    <div className="panel-heading"><div><p className="eyebrow">SERVICE INTAKE</p><h2 id="intake-title">Dispatch workspace</h2></div></div>
    <nav className="intake-tabs" aria-label="Service intake"><button aria-pressed={panel === 'queue'} onClick={() => { if (!editing || window.confirm('Discard unsaved draft changes?')) { setPanel('queue'); setEditing(false); } }}>Job queue</button><button aria-pressed={panel === 'intake'} onClick={() => { if (!editing || window.confirm('Discard unsaved draft changes?')) { setPanel('intake'); setEditing(false); } }}>New service request</button><button aria-pressed={panel === 'records'} onClick={() => { if (!editing || window.confirm('Discard unsaved draft changes?')) { setPanel('records'); setEditing(false); } }}>Customers & equipment</button></nav>
    {error && <p className="notice failure" role="alert">{error}</p>}{message && <p className="notice success" role="status">{message}</p>}
    {panel === 'records' && <div className="records-panel">{pickers}<p className="field-help">Select existing records to edit, or add a customer, then a site and its equipment. Site ownership and equipment location cannot be changed here.</p>
      <div className="record-actions">{selectedCustomer && <button onClick={() => setRecordEdit('customer')}>Edit selected customer</button>}{selectedSite && <button onClick={() => setRecordEdit('site')}>Edit selected site</button>}{selectedEquipment && <button onClick={() => setRecordEdit('equipment')}>Edit selected equipment</button>}{recordEdit && <button onClick={() => setRecordEdit(null)}>Cancel record edit</button>}<button onClick={refreshCatalog}>Reload records</button></div>
      <form key={`customer-${recordEdit === 'customer' ? `${selectedCustomer?.id}-${selectedCustomer?.version}` : 'new'}`} onSubmit={(event) => saveRecord('customer', event)} className="intake-form"><h3>{recordEdit === 'customer' ? 'Edit customer' : 'Add customer'}</h3><div className="intake-grid"><label>Customer name<input name="name" required maxLength={160} defaultValue={recordEdit === 'customer' ? selectedCustomer?.name : ''} /></label><label>Customer email<input name="email" type="email" maxLength={254} defaultValue={recordEdit === 'customer' ? selectedCustomer?.email ?? '' : ''} /></label><label>Customer phone<input name="phone" maxLength={40} defaultValue={recordEdit === 'customer' ? selectedCustomer?.phone ?? '' : ''} /></label></div><button disabled={busy}>Save customer</button></form>
      {customerId && <form key={`site-${recordEdit === 'site' ? `${selectedSite?.id}-${selectedSite?.version}` : customerId}`} onSubmit={(event) => saveRecord('site', event)} className="intake-form"><h3>{recordEdit === 'site' ? 'Edit service site' : 'Add service site'}</h3><div className="intake-grid"><label>Site name<input name="name" required maxLength={160} defaultValue={recordEdit === 'site' ? selectedSite?.name : ''} /></label><label>Street address<input name="address" required maxLength={500} defaultValue={recordEdit === 'site' ? selectedSite?.address : ''} /></label></div><label>Access notes<textarea aria-label="Access notes" name="accessNotes" maxLength={2000} defaultValue={recordEdit === 'site' ? selectedSite?.accessNotes : ''} /></label><button disabled={busy}>Save site</button></form>}
      {siteId && <form key={`equipment-${recordEdit === 'equipment' ? `${selectedEquipment?.id}-${selectedEquipment?.version}` : siteId}`} onSubmit={(event) => saveRecord('equipment', event)} className="intake-form"><h3>{recordEdit === 'equipment' ? 'Edit equipment' : 'Add equipment'}</h3><div className="intake-grid"><label>Manufacturer<input name="manufacturer" required maxLength={120} defaultValue={recordEdit === 'equipment' ? selectedEquipment?.manufacturer : ''} /></label><label>Model<input name="model" required maxLength={120} defaultValue={recordEdit === 'equipment' ? selectedEquipment?.model : ''} /></label><label>Serial number<input name="serialNumber" required maxLength={160} defaultValue={recordEdit === 'equipment' ? selectedEquipment?.serialNumber : ''} /></label></div><label>Equipment notes<textarea aria-label="Equipment notes" name="notes" maxLength={2000} defaultValue={recordEdit === 'equipment' ? selectedEquipment?.notes : ''} /></label><button disabled={busy}>Save equipment</button></form>}
    </div>}
    {panel === 'intake' && <><h3>New service request</h3>{!customers.length && <p>Add a customer, service site and equipment in Customers & equipment first.</p>}{jobForm()}</>}
    {panel === 'queue' && <>
      <form className="queue-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(query); refresh(); }}><label>Search jobs<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Complaint, customer or serial" maxLength={160} /></label><label>Job status<select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}><option value="">All states</option><option>DRAFT</option><option>TRIAGED</option><option>READY</option><option>ASSIGNED</option></select></label><label>Job priority<select value={priority} onChange={(event) => { setPage(1); setPriority(event.target.value); }}><option value="">All priorities</option>{['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value}>{value}</option>)}</select></label><button disabled={busy}>Search</button></form>
      {loading ? <p role="status">Loading jobs…</p> : !jobs.length ? <p>No service requests match these filters.</p> : <div className="job-list">{jobs.map((job) => <button className="job-card" key={job.id} onClick={() => void act(async () => { if (editing && !window.confirm('Discard unsaved draft changes?')) return; await openJob(job.id); })}><div><strong>{job.customerName}</strong><span>{job.complaint}</span><small>{job.siteName} · {job.equipmentLabel}</small></div><div><span className={`job-state ${job.status.toLowerCase()}`}>{job.status}</span><small>{job.priority} · {when(job.arrivalStart)}</small></div></button>)}</div>}
      <div className="pagination"><span>{total} jobs · Page {page} of {Math.max(1, Math.ceil(total / 10))}</span><button disabled={page === 1 || loading} onClick={() => setPage((value) => value - 1)}>Previous</button><button disabled={page * 10 >= total || loading} onClick={() => setPage((value) => value + 1)}>Next</button></div>
      {detail && <article className="job-detail" aria-label="Job detail"><div className="panel-heading"><h3>Service request details</h3><span className="job-state">{detail.status} · v{detail.version}</span></div><p className="job-id">Reference {detail.id}</p><h4>{detail.customer.name} · {detail.site.name}</h4><p>{detail.site.address}</p><p>{detail.equipment.manufacturer} {detail.equipment.model} · Serial {detail.equipment.serialNumber}</p><p className="preserve-lines">{detail.complaint}</p><dl className="job-facts"><div><dt>Arrival window</dt><dd>{when(detail.arrivalStart)} – {when(detail.arrivalEnd)}</dd></div><div><dt>Estimates</dt><dd>{detail.estimatedDurationMinutes} minutes work + {detail.travelBufferMinutes} minutes travel buffer</dd></div><div><dt>Access notes</dt><dd>{detail.site.accessNotes || 'None recorded'}</dd></div><div><dt>Equipment notes</dt><dd>{detail.equipment.notes || 'None recorded'}</dd></div></dl>
        <div className="record-actions"><button disabled={busy} onClick={() => void act(async () => { if (editing && !window.confirm('Discard unsaved draft changes and reload?')) return; await openJob(detail.id); })}>Reload latest job</button>{['DRAFT', 'TRIAGED', 'READY'].includes(detail.status) && <button disabled={busy} onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel draft edit' : 'Edit draft'}</button>}{detail.status === 'DRAFT' && !editing && <button disabled={busy} onClick={() => void act(async () => { await api(`/api/v1/jobs/${detail.id}/transitions`, { method: 'POST', body: JSON.stringify({ version: detail.version, status: 'TRIAGED', reason: '' }) }, session); await openJob(detail.id); refresh(); setMessage('Job triaged. Scheduling comes next.'); })}>Triage job</button>}</div>
        {editing && jobForm(detail)}
        {detail.status === 'TRIAGED' && <form className="intake-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void act(async () => { await api(`/api/v1/jobs/${detail.id}/transitions`, { method: 'POST', body: JSON.stringify({ version: detail.version, status: 'DRAFT', reason: data.get('reason') }) }, session); await openJob(detail.id); refresh(); }); }}><label>Reason to return to draft<textarea name="reason" required maxLength={2000} /></label><button disabled={busy}>Return to draft</button></form>}
        {detail.status !== 'ASSIGNED' && <JobEligibility session={session} job={detail} onChanged={async () => { await openJob(detail.id); refresh(); }} />}
        <DispatchPreparation session={session} job={detail} onChanged={async () => { await openJob(detail.id); refresh(); }} />
        <h4>Job timeline</h4><ol className="job-timeline">{detail.timeline.map((event) => <li key={event.id}><strong>{event.kind.toLowerCase().replaceAll('_', ' ')}</strong><p className="preserve-lines">{event.note}</p><small>{event.actorName} · {when(event.createdAt)}</small></li>)}</ol><p className="field-help">Most recent 100 changes. The full audit remains in the database.</p>
        <h4>Other service requests for this equipment</h4>{detail.equipmentHistory.length ? <ul className="equipment-history">{detail.equipmentHistory.map((job) => <li key={job.id}><button onClick={() => void act(async () => { if (editing && !window.confirm('Discard unsaved draft changes?')) return; await openJob(job.id); })}>{job.complaint} · {job.status} · {when(job.createdAt)}</button></li>)}</ul> : <p>No earlier or other service requests recorded.</p>}<p className="field-help">Shows the newest 20 other requests, including drafts. Completed visit outcomes arrive in a later phase.</p>
      </article>}
    </>}
  </section>;
}
