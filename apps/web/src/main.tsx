import { StrictMode, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { z } from 'zod';
import { healthSchema, sessionSchema, organizationSchema, membershipSchema, type Session, type Organization, type Membership, type Health } from '@servicegrid/contracts';
import './styles.css';
import './professional.css';
import { Landing } from './Landing';
import { Brand, Icon, type IconName } from './Icon';
import { Overview } from './Overview';
import { api, ApiError } from './api';
import { Intake } from './Intake';
import { Workforce } from './Workforce';
import { PartsCatalog } from './PartsCatalog';
import { TechnicianWorkspace } from './TechnicianWorkspace';
import { DataWorkspace } from './DataWorkspace';
import { ManualLibrary } from './ManualLibrary';
import { InventoryWorkspace } from './InventoryWorkspace';
import { confirmDiscard, clearUnsavedChanges } from './unsaved';

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
    if (id === session?.activeOrganization?.id || !confirmDiscard()) return;
    void action(async () => {
      await api('/api/v1/me/organization', { method: 'POST', body: JSON.stringify({ organizationId: id }) }, session);
      await load(); setView('dispatch'); setMenuOpen(false); setMessage('Company workspace updated.');
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
    if (!confirmDiscard()) return;
    void action(async () => {
      const result = z.object({ logoutUrl: z.url() }).parse(await api('/api/auth/logout', { method: 'POST' }, session));
      clearUnsavedChanges(); sessionStorage.removeItem('pendingInvitation'); setSession(null); setMembers([]); setAudit([]); window.location.assign(result.logoutUrl);
    });
  }
  const company = session?.activeOrganization;
  const [view, setView] = useState('dispatch');
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? []);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenuOpen(false); }
      if (event.key === 'Tab') { const controls = focusable(); const first = controls[0]; const last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus(); };
  }, [menuOpen]);
  function navigate(next: string) { setMessage(''); setView(next); setMenuOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  const sections: { id: string; label: string; icon: IconName; description: string }[] = company?.role === 'TECHNICIAN' ? [{ id: 'dispatch', label: 'My visits', icon: 'jobs', description: 'Your assignments, preparation and visit outcomes.' }] : [
    { id: 'overview', label: 'Overview', icon: 'grid', description: 'The work ahead. The details that matter.' },
    { id: 'dispatch', label: 'Dispatch', icon: 'jobs', description: 'Prepare the details. Make a confident handoff.' },
    { id: 'workforce', label: 'Workforce', icon: 'team', description: 'The right skills, in the right place.' },
    { id: 'parts', label: 'Parts & locations', icon: 'box', description: 'Organize the parts behind every service visit.' },
    ...(company?.role === 'OWNER' ? [
      { id: 'inventory', label: 'Inventory', icon: 'box' as const, description: 'Protect required stock. Account for every change.' },
      { id: 'manuals', label: 'Manuals & evidence', icon: 'book' as const, description: 'Give preparation a reliable source.' },
      { id: 'reports', label: 'Reports & data', icon: 'chart' as const, description: 'Understand outcomes. Keep your records connected.' },
      { id: 'team', label: 'Team & access', icon: 'settings' as const, description: 'Bring the right people into your workspace.' },
    ] : []),
  ];
  const selectedSection = sections.find((item) => item.id === view) ?? { id: 'dispatch', label: 'Dispatch', icon: 'jobs' as const, description: 'Prepare the details. Make a confident handoff.' };
  if (loading) return <div className="app-loading"><Brand dark /><span className="loading-spinner" aria-hidden="true" /><p role="status">Opening your workspace…</p></div>;
  if (!session) return <Landing loginUrl={config?.enabled ? config.loginUrl : undefined} error={error} />;
  return <div className="shell professional-shell">
    <a className="skip-link" href="#workspace-main">Skip to workspace content</a>
    {menuOpen && <button className="sidebar-backdrop" aria-label="Close workspace navigation" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebar} role={menuOpen ? 'dialog' : undefined} aria-modal={menuOpen ? true : undefined} className={`app-sidebar ${menuOpen ? 'sidebar-open' : ''}`} aria-label="Workspace sidebar"><Brand /><div className="sidebar-company"><span className="company-monogram">{(company?.name ?? 'SG').slice(0,2).toUpperCase()}</span><div><strong>{company?.name ?? 'Your workspace'}</strong><small>{company ? 'Company workspace' : 'Select a company to begin'}</small></div></div><p className="workspace-label">WORKSPACE</p><nav aria-label="Workspace navigation">{sections.map((item) => <button key={item.id} className={`sidebar-link ${view === item.id ? 'is-active' : ''}`} aria-current={view === item.id ? 'page' : undefined} disabled={busy || !company} onClick={() => navigate(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{view === item.id && <span className="nav-indicator" />}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-tip"><Icon name="shield" size={22} /><strong>Better visits start here.</strong><p>People, parts and preparation.<br />One connected workflow.</p></div><div className="sidebar-profile"><span className="avatar">{session?.user.name.slice(0,2).toUpperCase() ?? 'SG'}</span><div><strong>{session?.user.name ?? 'ServiceGrid IQ'}</strong><small>{company?.role.toLowerCase() ?? 'Company account'}</small></div></div></div></aside>
    <main id="workspace-main" className="app-main" inert={menuOpen}>
      <header className="app-topbar"><div className="topbar-breadcrumb"><button className="mobile-menu" aria-label="Open workspace navigation" disabled={busy || !company} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button><span className="breadcrumb-parent">Workspace</span><Icon name="chevron" size={13} /><strong>{company ? selectedSection.label : 'Welcome'}</strong></div><div className="header-actions"><span className="topbar-date"><Icon name="sun" size={16} />{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric'}).format(new Date())}</span>{session && <button className="signout-button" onClick={signOut} disabled={busy}><Icon name="logout" size={16} /><span>Sign out</span></button>}</div></header>
      {loading ? <p className="feedback" role="status">Opening your workspace…</p> : <>
        <section className="intro workspace-intro"><div><p className="eyebrow">SERVICEGRID IQ / {company ? selectedSection.label.toUpperCase() : 'WELCOME'}</p><h1>{company ? (company.role === 'TECHNICIAN' ? 'Your day in the field.' : selectedSection.label === 'Dispatch' ? 'Dispatch & readiness' : selectedSection.label) : 'Your team. Your workspace.'}</h1><p className="lede">{company ? selectedSection.description : 'Choose your company and get ready for a more connected service day.'}</p></div><span className="workspace-context"><span className="live-dot" />{company ? 'Company workspace' : 'Company account'}</span></section>
        {error && <div className="notice failure" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        {session && <>
          {pendingInvite && <section className="status-panel invitation-panel"><h2>You have a company invitation</h2><p>Accept using the email address the invitation was sent to.</p><button disabled={busy} onClick={() => void action(async () => { await api('/api/v1/invitations/accept', { method: 'POST', body: JSON.stringify({ token: pendingInvite }) }, session); sessionStorage.removeItem('pendingInvitation'); setPendingInvite(''); await load(); setMessage('Invitation accepted. Select your company below.'); })}>Accept invitation</button></section>}
          <section className={`status-panel company-selector ${company ? 'compact-selector' : ''}`} aria-labelledby="company-title"><div className="panel-heading"><div><p className="eyebrow">COMPANY WORKSPACE</p><h2 id="company-title">Where are you working today?</h2></div></div>{organizations.length ? <div className="company-grid">{organizations.map((organization) => <button key={organization.id} disabled={busy} aria-pressed={company?.id === organization.id} className={`company-card ${company?.id === organization.id ? 'selected' : ''}`} onClick={() => selectOrganization(organization.id)}><strong>{organization.name}</strong><span>{organization.role.toLowerCase()}</span><small>{company?.id === organization.id ? 'Active workspace' : 'Open workspace →'}</small></button>)}</div> : <p>No company access has been assigned yet. Ask your company owner for an invitation.</p>}</section>
          {company && <div className="workspace-role"><span className="role-badge">{company.role}</span><span>Working in {company.name}</span></div>}
          {company && company.role !== 'TECHNICIAN' && view === 'overview' && <Overview key={`overview-${company.id}`} session={session} open={navigate} />}
          {company?.role === 'TECHNICIAN' && <TechnicianWorkspace key={`technician-${company.id}`} session={session!} />}
          {company && company.role !== 'TECHNICIAN' && <div className="workspace-pane" hidden={view !== 'dispatch'}><Intake key={`intake-${company.id}`} session={session!} /></div>}
          {company && company.role !== 'TECHNICIAN' && <div className="workspace-pane" hidden={view !== 'workforce'}><Workforce key={`workforce-${company.id}`} session={session!} /></div>}
          {company && company.role !== 'TECHNICIAN' && <div className="workspace-pane" hidden={view !== 'parts'}><PartsCatalog key={`parts-${company.id}`} session={session!} /></div>}
          {company?.role === 'OWNER' && <>
            <div className="workspace-pane" hidden={view !== 'reports'}><DataWorkspace key={`data-${company.id}`} session={session!} /></div>
            <div className="workspace-pane" hidden={view !== 'manuals'}><ManualLibrary key={`manuals-${company.id}`} session={session!} /></div>
            <div className="workspace-pane" hidden={view !== 'inventory'}><InventoryWorkspace key={`stock-${company.id}`} session={session!} /></div>
            <div className="workspace-pane" hidden={view !== 'team'}><section className="status-panel team-panel"><div className="panel-heading"><div><p className="eyebrow">TEAM ACCESS</p><h2>People in this company</h2></div></div>
              <div className="team-list">{members.map((member) => <article className="member-row" key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span><small>{member.active ? 'Active' : 'Access disabled'}</small></div><div className="member-actions"><select aria-label={`Role for ${member.email}`} value={member.role} disabled={busy} onChange={(event) => updateMember(member, { role: event.target.value as Membership['role'] })}><option value="OWNER">Owner</option><option value="DISPATCHER">Dispatcher</option><option value="TECHNICIAN">Technician</option></select><button disabled={busy} onClick={() => { if (window.confirm(`${member.active ? 'Disable' : 'Enable'} access for ${member.name}?`)) updateMember(member, { active: !member.active }); }}>{member.active ? 'Disable access' : 'Enable access'}</button></div></article>)}</div>
              <form className="invite-form" onSubmit={invite}><h3>Invite someone</h3><div className="form-row"><label>Email address<input name="email" type="email" required placeholder="name@company.com" /></label><label>Role<select name="role" defaultValue="TECHNICIAN"><option value="TECHNICIAN">Technician</option><option value="DISPATCHER">Dispatcher</option><option value="OWNER">Owner</option></select></label><button type="submit" disabled={busy}>Create invitation</button></div></form>
              {inviteUrl && <div className="invite-result"><label>Invitation link<input aria-label="Invitation link" readOnly value={inviteUrl} /></label><button onClick={() => void navigator.clipboard.writeText(inviteUrl).then(() => setMessage('Invitation link copied.')).catch(() => setError('Select and copy the invitation link.'))}>Copy link</button></div>}
            </section>
            <section className="status-panel audit-panel"><p className="eyebrow">RECENT COMPANY CHANGES</p><h2>Company activity</h2><ul>{audit.slice(0, 10).map((event) => <li key={event.id}><span>{event.action.toLowerCase().replaceAll('_', ' ')}</span><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</time></li>)}</ul></section></div>
          </>}
        </>}
        <details className="connection-details"><summary>Workspace connection</summary><section className="next-section"><div><p className="eyebrow">CONNECTION STATUS</p><h2>Connection details</h2></div><p>{health ? `API ${health.status === 'ok' ? 'connected' : 'degraded'} · Database ${health.checks.database}` : 'Check the current application and database connection.'}</p><button disabled={busy} onClick={() => void action(async () => { const response = await fetch('/health/ready', { signal: AbortSignal.timeout(6000) }); setHealth(healthSchema.parse(await response.json())); })}>Check connection</button></section></details>
        <footer className="app-footer"><span>ServiceGrid IQ</span><span>Prepare the visit. Make every dispatch count.</span></footer>
      </>}
    </main>
  </div>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
