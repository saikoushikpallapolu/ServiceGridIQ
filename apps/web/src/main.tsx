import { StrictMode, useCallback, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { healthSchema, sessionSchema, organizationSchema, membershipSchema, type Session, type Organization, type Membership, type Health } from '@servicegrid/contracts';
import './styles.css';
import { api, ApiError } from './api';
import { Intake } from './Intake';

const authConfigSchema = z.object({ enabled: z.boolean(), mode: z.string(), loginUrl: z.url() });
const auditSchema = z.object({ items: z.array(z.object({ id: z.uuid(), action: z.string(), targetId: z.string(), createdAt: z.iso.datetime() })) });
type Audit = z.infer<typeof auditSchema>['items'];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [config, setConfig] = useState<z.infer<typeof authConfigSchema> | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [audit, setAudit] = useState<Audit>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [pendingInvite, setPendingInvite] = useState(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) sessionStorage.setItem('pendingInvitation', token);
    if (token) history.replaceState(null, '', window.location.pathname);
    return sessionStorage.getItem('pendingInvitation') ?? '';
  });
  const load = useCallback(async () => {
    try {
      const current = sessionSchema.parse(await api('/api/auth/session'));
      setSession(current);
      setOrganizations(z.object({ items: z.array(organizationSchema) }).parse(await api('/api/v1/me/organizations', {}, current)).items);
      if (current.activeOrganization?.role === 'OWNER') {
        setMembers(z.object({ items: z.array(membershipSchema) }).parse(await api('/api/v1/memberships', {}, current)).items);
        setAudit(auditSchema.parse(await api('/api/v1/audit-events', {}, current)).items);
      } else { setMembers([]); setAudit([]); }
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { setSession(null); setOrganizations([]); setMembers([]); setAudit([]); }
      else throw failure;
    }
  }, []);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const settings = authConfigSchema.parse(await api('/api/auth/config'));
        if (!active) return;
        setConfig(settings);
        if (settings.enabled) await load();
        if (new URLSearchParams(window.location.search).has('authError')) {
          setError('Sign-in could not be completed. Please try again.'); history.replaceState(null, '', window.location.pathname);
        }
      } catch { if (active) setError('Could not connect to the workspace. Refresh to try again.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [load]);
  async function action(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setMessage(''); setInviteUrl('');
    try { await work(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong. Please try again.');
      if (failure instanceof ApiError && [401, 403, 404].includes(failure.status)) await load().catch(() => {});
    } finally { setBusy(false); }
  }
  function selectOrganization(id: string) {
    void action(async () => {
      await api('/api/v1/me/organization', { method: 'POST', body: JSON.stringify({ organizationId: id }) }, session);
      await load(); setMessage('Company workspace updated.');
    });
  }
  function updateMember(member: Membership, patch: Partial<Pick<Membership, 'role' | 'active'>>) {
    void action(async () => {
      await api(`/api/v1/memberships/${member.id}`, { method: 'PATCH', body: JSON.stringify({ role: member.role, active: member.active, ...patch }) }, session);
      await load(); setMessage('Team access updated.');
    });
  }
  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    void action(async () => {
      const result = z.object({ inviteUrl: z.url() }).parse(await api('/api/v1/invitations', {
        method: 'POST', body: JSON.stringify({ email: data.get('email'), role: data.get('role') }),
      }, session));
      setInviteUrl(result.inviteUrl); setMessage('Invitation created. Share the link with that person.'); form.reset(); await load();
    });
  }
  function signOut() {
    void action(async () => {
      const result = z.object({ logoutUrl: z.url() }).parse(await api('/api/auth/logout', { method: 'POST' }, session));
      sessionStorage.removeItem('pendingInvitation'); setSession(null); setMembers([]); setAudit([]); window.location.assign(result.logoutUrl);
    });
  }
  const company = session?.activeOrganization;
  return <div className="shell">
    <aside><a className="brand" href="/" aria-label="ServiceGrid IQ home"><span className="brand-icon">S</span><span>ServiceGrid <b>IQ</b></span></a><span className="workspace-label">YOUR WORKSPACE</span><div className="nav-active"><span aria-hidden="true">◈</span> Company workspace</div><p className="aside-note">Prepare the visit.<br />Make every dispatch count.</p><div className="phase-tag">Service intake & team access</div></aside>
    <main>
      <header><span>Workspace / {company?.name ?? 'Welcome'}</span><div className="header-actions">{session ? <><span>{session.user.name}</span><button onClick={signOut} disabled={busy}>Sign out</button></> : <span className="environment">Development workspace</span>}</div></header>
      {loading ? <p className="feedback" role="status">Opening your workspace…</p> : <>
        <section className="intro"><p className="eyebrow">SERVICE OPERATIONS, PREPARED</p><h1>{session ? 'Your team. Your workspace.' : <>A better visit starts<br />before the dispatch.</>}</h1><p className="lede">{session ? 'Choose a company to work in. Your role controls the information and actions available in each workspace.' : 'Sign in to access your company workspace and keep your service team’s information together.'}</p></section>
        {error && <div className="notice failure" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        {!session ? <section className="status-panel signin-panel"><p className="eyebrow">WELCOME TO SERVICEGRID IQ</p><h2>Sign in to your workspace</h2><p className="lede">Use your company account to continue.</p>{config?.enabled ? <a className="primary-button" href={config.loginUrl}>Sign in</a> : <p>Sign-in is not configured for this environment.</p>}</section> : <>
          {pendingInvite && <section className="status-panel invitation-panel"><h2>You have a company invitation</h2><p>Accept using the email address the invitation was sent to.</p><button disabled={busy} onClick={() => void action(async () => { await api('/api/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ token: pendingInvite }) }, session); sessionStorage.removeItem('pendingInvitation'); setPendingInvite(''); await load(); setMessage('Invitation accepted. Select your company below.'); })}>Accept invitation</button></section>}
          <section className="status-panel" aria-labelledby="company-title"><div className="panel-heading"><div><p className="eyebrow">COMPANY SELECTION</p><h2 id="company-title">Where are you working today?</h2></div></div>{organizations.length ? <div className="company-grid">{organizations.map((organization) => <button key={organization.id} disabled={busy} aria-pressed={company?.id === organization.id} className={`company-card ${company?.id === organization.id ? 'selected' : ''}`} onClick={() => selectOrganization(organization.id)}><strong>{organization.name}</strong><span>{organization.role.toLowerCase()}</span><small>{company?.id === organization.id ? 'Active workspace' : 'Open workspace →'}</small></button>)}</div> : <p>No company access has been assigned yet. Ask your company owner for an invitation.</p>}</section>
          {company && <section className="workspace-summary"><span className="role-badge">{company.role}</span><h2>{company.name}</h2><p>{company.role === 'OWNER' ? 'You can manage intake, team access and review company changes.' : 'Your company workspace is ready. Dispatchers can manage intake; assigned-job tools arrive in a later phase.'}</p></section>}
          {company && company.role !== 'TECHNICIAN' && <Intake key={company.id} session={session!} />}
          {company?.role === 'OWNER' && <>
            <section className="status-panel team-panel"><div className="panel-heading"><div><p className="eyebrow">TEAM ACCESS</p><h2>People in this company</h2></div></div>
              <div className="team-list">{members.map((member) => <article className="member-row" key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span><small>{member.active ? 'Active' : 'Access disabled'}</small></div><div className="member-actions"><select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={(event) => updateMember(member, { role: event.target.value as Membership['role'] })}><option value="OWNER">Owner</option><option value="DISPATCHER">Dispatcher</option><option value="TECHNICIAN">Technician</option></select><button disabled={busy} onClick={() => { if (window.confirm(`${member.active ? 'Disable' : 'Enable'} access for ${member.name}?`)) updateMember(member, { active: !member.active }); }}>{member.active ? 'Disable access' : 'Enable access'}</button></div></article>)}</div>
              <form className="invite-form" onSubmit={invite}><h3>Invite someone</h3><div className="form-row"><label>Email address<input name="email" type="email" required placeholder="name@company.com" /></label><label>Role<select name="role" defaultValue="TECHNICIAN"><option value="TECHNICIAN">Technician</option><option value="DISPATCHER">Dispatcher</option><option value="OWNER">Owner</option></select></label><button type="submit" disabled={busy}>Create invitation</button></div></form>
              {inviteUrl && <div className="invite-result"><label>Invitation link<input aria-label="Invitation link" readOnly value={inviteUrl} /></label><button onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage('Invitation link copied.')).catch(() => setError('Select and copy the invitation link.'))}>Copy link</button></div>}
            </section>
            <section className="status-panel audit-panel"><p className="eyebrow">RECENT COMPANY CHANGES</p><h2>Company activity</h2><ul>{audit.slice(0, 10).map((event) => <li key={event.id}><span>{event.action.toLowerCase().replaceAll('_', ' ')}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul></section>
          </>}
        </>}
        <section className="next-section"><div><p className="eyebrow">CONNECTION STATUS</p><h2>Application foundation</h2></div><p>{health ? `API ${health.status === 'ok' ? 'connected' : 'degraded'} · Database ${health.checks.database}` : 'Check the current application and database connection.'}</p><button disabled={busy} onClick={() => void action(async () => { const response = await fetch('/health/ready', { signal: AbortSignal.timeout(6000) }); setHealth(healthSchema.parse(await response.json())); })}>Check connection</button></section>
        <footer>ServiceGrid IQ <span>Service intake is available. Scheduling and assignment are still in development.</span></footer>
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
