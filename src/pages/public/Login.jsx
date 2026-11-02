import { useState } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { login, resetDemo, useSession, demoAccounts } from '../../data/session';
import { ROLES, DEMO_PASSWORD } from '../../lib/constants';
import { Badge, BrandMark, Stripes, Confirm, toast, Field } from '../../components/ui';
import { db } from '../../data/store';
import { useLang } from '../../lib/i18n';

export default function Login() {
  const { t } = useLang();
  const { user, mode, error: sErr } = useSession();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const nav = useNavigate();
  const loc = useLocation();
  if (user) return <Navigate to={loc.state?.from || (user.role === 'student' ? '/app/me' : '/app')} replace />;

  const go = async (em, p) => {
    setErr('');
    setBusy(true);
    try {
      await login(em, p);
      nav(loc.state?.from || '/app', { replace: true });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const accounts = demoAccounts();

  return (
    <div className="auth-wrap">
      <div className="auth-left">
        <Link to="/" className="brand" style={{ padding: 0 }}><BrandMark /><span><b>APAAR-Setu</b><small>AICTE student data &amp; verification</small></span></Link>
        <Stripes />
        <h1>One sign-in. Six roles. Each sees only what it should.</h1>
        <p style={{ color: '#d9c9a6' }}>Role-based access control decides every page and every action. AICTE sees the nation, a Regional Officer sees a region, a college sees itself, a student sees only their own record, and a verifier sees only what a student has consented to share.</p>
        <div className="col">
          {Object.values(ROLES).map((r) => (
            <div key={r.label} className="row" style={{ alignItems: 'flex-start' }}>
              <Badge color={r.color}>{r.short}</Badge>
              <span className="small" style={{ color: '#e6d8b8', flex: 1 }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="auth-right">
        <div className="row between">
          <h1 style={{ margin: 0 }}>{t('Sign in')}</h1>
          <Link to="/">← {t('Home')}</Link>
        </div>
        <p className="muted">{mode === 'firebase' ? 'Connected to Firebase (Auth + Firestore).' : 'Demo mode: data is stored in this browser. Pick a demo account below or type the credentials.'}</p>
        {(err || sErr) && <div className="callout bad">{err || sErr}</div>}
        <form className="card col" style={{ maxWidth: 520 }} onSubmit={(e) => { e.preventDefault(); go(email, pw); }}>
          <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@college.edu" required autoComplete="username" /></Field>
          <Field label="Password"><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete="current-password" /></Field>
          <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : t('Sign in')}</button>
        </form>

        <h2 className="mt">Demo accounts <span className="small muted">(password <code>{DEMO_PASSWORD}</code>)</span></h2>
        <p className="small muted">Click a card to sign in as that person. Each one shows a different part of the platform.</p>
        <div className="grid g2" style={{ maxWidth: 820 }}>
          {accounts.map((a) => {
            const u = mode === 'local' ? db.find('users', (x) => x.email === a.email) : null;
            if (mode === 'local' && !u) return null;
            const inst = a.institutionId && db.get('institutions', a.institutionId);
            return (
              <button key={a.key} className="role-card" onClick={() => go(a.email, DEMO_PASSWORD)} disabled={busy}>
                <span className="row"><Badge color={ROLES[a.role].color}>{ROLES[a.role].label}</Badge></span>
                <span className="who">{u?.name || a.name || 'Demo student'}</span>
                <span className="small muted">{inst ? inst.name : a.org || a.title || (a.role === 'student' ? 'B.Tech student with an AICTE-signed credential' : '')}</span>
                <span className="em">{a.email}</span>
              </button>
            );
          })}
        </div>
        {mode === 'local' && (
          <div className="mt">
            <button className="btn sm" onClick={() => setConfirmReset(true)}>↺ Reset demo data</button>
            <span className="small muted"> Rebuilds the synthetic dataset (16 colleges, ~1,750 students, planted anomalies).</span>
          </div>
        )}
        {confirmReset && (
          <Confirm title="Reset demo data?" body="All changes you made in this browser will be replaced with a fresh synthetic dataset." confirmLabel="Reset" onClose={() => setConfirmReset(false)} onConfirm={() => { resetDemo(); toast('Demo data rebuilt', 'good'); }} />
        )}
      </div>
    </div>
  );
}
