// App shell: role-based sidebar, top bar with scope, language and inbox.
import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useSession, logout, reloadData } from '../data/session';
import { useStore, getMode, db } from '../data/store';
import { ROLES } from '../lib/constants';
import { scopeLabel, visibleFlags, visibleBatches } from '../data/scope';
import { inboxFor } from '../services/notify';
import { LANGS, useLang, setLang } from '../lib/i18n';
import { Stripes, BrandMark, Badge, toast } from './ui';
import Chatbot from './Chatbot';

const ALL = ['aicte_admin', 'regional_officer', 'institution_admin', 'data_clerk', 'student', 'verifier'];
const STAFF = ['aicte_admin', 'regional_officer'];
const INST = ['institution_admin', 'data_clerk'];

export const NAV = [
  { group: 'Monitor', items: [
    { to: '/app', label: 'Dashboard', ico: '▦', roles: [...STAFF, ...INST, 'verifier'], end: true },
    { to: '/app/me', label: 'My record', ico: '◉', roles: ['student'] },
    { to: '/app/institutions', label: 'Institutions', ico: '⌂', roles: STAFF },
    { to: '/app/radar', label: 'Ghost Student Radar', ico: '◎', roles: STAFF },
    { to: '/app/flags', label: 'Flags', ico: '⚑', roles: [...STAFF, 'institution_admin'], count: 'flags' },
    { to: '/app/inspection', label: 'Inspection planner', ico: '✓', roles: STAFF },
    { to: '/app/trust', label: 'Trust score', ico: '★', roles: INST },
  ] },
  { group: 'Records', items: [
    { to: '/app/ledger', label: 'Seat Ledger', ico: '▤', roles: [...STAFF, ...INST] },
    { to: '/app/students', label: 'Students', ico: '☰', roles: [...STAFF, ...INST] },
    { to: '/app/upload', label: 'Upload', ico: '⇪', roles: INST },
    { to: '/app/batches', label: 'Batches', ico: '▣', roles: [...STAFF, ...INST], count: 'batches' },
    { to: '/app/lifecycle', label: 'Lifecycle', ico: '↻', roles: [...STAFF, 'institution_admin'] },
    { to: '/app/scholarships', label: 'Scholarships', ico: '₹', roles: STAFF },
    { to: '/app/credentials', label: 'My credentials', ico: '▢', roles: ['student'] },
    { to: '/app/consent', label: 'Consent', ico: '✋', roles: ['student'], count: 'consent' },
    { to: '/app/access', label: 'Who viewed my data', ico: '👁', roles: ['student'] },
    { to: '/verify', label: 'Verify a credential', ico: '✔', roles: ['verifier', 'student', ...STAFF, 'institution_admin'] },
    { to: '/app/requests', label: 'Access requests', ico: '⇄', roles: ['verifier'] },
  ] },
  { group: 'Output', items: [
    { to: '/app/reports', label: 'Reports', ico: '▥', roles: [...STAFF, 'institution_admin'] },
    { to: '/app/certificates', label: 'Certificates', ico: '✎', roles: ['institution_admin'] },
    { to: '/transparency', label: 'Transparency', ico: '◫', roles: ALL },
  ] },
  { group: 'Admin', items: [
    { to: '/app/audit', label: 'Audit trail', ico: '⛓', roles: ['aicte_admin'] },
    { to: '/app/users', label: 'Users', ico: '☺', roles: ['aicte_admin', 'institution_admin'] },
    { to: '/app/rules', label: 'Rules & settings', ico: '⚙', roles: ['aicte_admin'] },
    { to: '/app/api', label: 'API sandbox', ico: '{}', roles: ['aicte_admin', 'institution_admin', 'data_clerk', 'verifier'] },
    { to: '/app/inbox', label: 'Inbox', ico: '✉', roles: ALL, count: 'inbox' },
    { to: '/help', label: 'Help', ico: '?', roles: ALL },
    { to: '/app/profile', label: 'Profile', ico: '⚲', roles: ALL },
  ] },
];

function counts(user) {
  return {
    flags: visibleFlags(user).filter((f) => f.status === 'open').length,
    batches: user.role === 'institution_admin' ? visibleBatches(user).filter((b) => b.status === 'draft').length : ['aicte_admin', 'regional_officer'].includes(user.role) ? visibleBatches(user).filter((b) => b.status === 'submitted').length : 0,
    consent: db.where('consents', (c) => c.apaarId === user.apaarId && c.status === 'pending').length,
    inbox: inboxFor(user).filter((n) => !n.read).length,
  };
}

export default function Layout({ children }) {
  useStore();
  const { lang, t } = useLang();
  const { user, mode } = useSession();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  if (!user) return null;
  const c = counts(user);
  return (
    <>
      <div className="shell">
        <aside className={`sidebar ${open ? 'open' : ''}`} onClick={(e) => e.target.closest('a') && setOpen(false)}>
          <Link to="/" className="brand"><BrandMark /><span><b>APAAR-Setu</b><small>AICTE student data</small></span></Link>
          <Stripes />
          <nav className="nav">
            {NAV.map((g) => {
              const items = g.items.filter((i) => i.roles.includes(user.role));
              if (!items.length) return null;
              return (
                <div className="nav-group" key={g.group}>
                  <h6>{t(g.group)}</h6>
                  {items.map((i) => (
                    <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                      <span className="ico" aria-hidden>{i.ico}</span>{t(i.label)}
                      {i.count && c[i.count] > 0 && <span className="count">{c[i.count]}</span>}
                    </NavLink>
                  ))}
                </div>
              );
            })}
          </nav>
          <div className="side-foot">
            <div><b style={{ color: 'var(--cream)' }}>{user.name}</b></div>
            <div>{ROLES[user.role].label}{user.title ? ' · ' + user.title : ''}</div>
            <button className="btn sm sun mt-s" onClick={async () => { await logout(); nav('/login'); }}>{t('Sign out')}</button>
          </div>
        </aside>
        <div className="main">
          {mode === 'local' && (
            <div className="demo-ribbon no-print">
              <b>{t('Demo mode')}</b>
              <span>Data lives in this browser. Add Firebase keys to switch to Firestore (see README).</span>
            </div>
          )}
          <header className="topbar">
            <button className="btn sm menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
            <div className="scope">
              <Badge color={ROLES[user.role].color}>{ROLES[user.role].short}</Badge>{' '}
              <b>{scopeLabel(user)}</b>
            </div>
            <div className="spacer" />
            {getMode() === 'firebase' && (
              <button className="btn sm" onClick={async () => { await reloadData(); toast('Data refreshed from Firestore', 'good'); }}>⟳ Refresh</button>
            )}
            <select className="input" style={{ width: 'auto', padding: '4px 8px' }} value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('Language')}>
              {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <NavLink to="/app/inbox" className="btn sm" title="Inbox">✉ {c.inbox > 0 && <Badge color="red">{c.inbox}</Badge>}</NavLink>
          </header>
          <main className="content" key={loc.pathname}>
            {children || <Outlet />}
          </main>
        </div>
      </div>
      <Chatbot />
    </>
  );
}
