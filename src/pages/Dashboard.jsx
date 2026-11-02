import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Page, Card, Stat, Badge, Bar, Table, Callout } from '../components/ui';
import IndiaMap from '../components/IndiaMap';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleInstitutions, visibleEnrolments, visibleFlags, visibleBatches, scopeLabel } from '../data/scope';
import { CATEGORIES, VCODES, ROLES } from '../lib/constants';
import { instMetrics, trustBand } from '../services/analytics';
import { trustAll } from '../services/trust';
import { occupancy } from '../services/ledger';
import { countBy, fmtDate, fmtDateTime, pct } from '../lib/util';
import { runRadar } from '../services/radar';
import { toast } from '../components/ui';
import { effectiveStatus } from '../services/consent';

export const PALETTE = ['#c4372a', '#dc7424', '#e2ac1c', '#3c7a47', '#2f6a6e', '#8a4f2a', '#b5893a', '#6b8f4e'];
const ax = { fontSize: 11, fill: '#4e3d31' };

export default function Dashboard() {
  const { user } = useSession();
  if (user.role === 'student') return <Navigate to="/app/me" replace />;
  if (user.role === 'verifier') return <VerifierDash user={user} />;
  if (['institution_admin', 'data_clerk'].includes(user.role)) return <InstDash user={user} />;
  return <NationalDash user={user} />;
}

function NationalDash({ user }) {
  const v = useStore();
  const nav = useNavigate();
  const rules = db.rules();
  const [stateSel, setStateSel] = useState(null);
  const [metric, setMetric] = useState('fill');
  const insts = visibleInstitutions(user);
  const trust = trustAll(v);
  const ms = useMemo(() => insts.map((i) => ({ ...instMetrics(i, rules), trust: trust.get(i.id) })), [v, user.id]);
  const shown = ms.filter((m) => !stateSel || m.inst.state === stateSel);
  const active = shown.flatMap((m) => m.active);
  const intake = shown.reduce((s, m) => s + m.intake, 0);
  const within = shown.reduce((s, m) => s + m.within, 0);
  const verified = active.filter((e) => e.recordState === 'aicte_verified').length;
  const flags = visibleFlags(user).filter((f) => ['open', 'review'].includes(f.status) && (!stateSel || f.state === stateSel));
  const ids = new Set(shown.map((m) => m.inst.id));
  const blocked = db.where('ledger', (l) => l.action === 'BLOCKED' && ids.has(l.institutionId)).length;
  const pending = visibleBatches(user).filter((b) => b.status === 'submitted' && ids.has(b.institutionId));
  const radar = db.get('settings', 'radar');

  const byState = {};
  ms.forEach((m) => {
    const s = (byState[m.inst.state] = byState[m.inst.state] || { intake: 0, within: 0, flags: 0, trust: [] });
    s.intake += m.intake;
    s.within += m.within;
    s.flags += m.flags.length;
    s.trust.push(m.trust.score);
  });
  const mapValues = Object.fromEntries(Object.entries(byState).map(([st, s]) => {
    if (metric === 'fill') {
      const p = pct(s.within, s.intake);
      return [st, { value: p + '%', label: `${p}% of regular seats filled`, color: p >= 98 ? 'red' : p >= 90 ? 'orange' : p >= 80 ? 'yellow' : 'green' }];
    }
    if (metric === 'flags') return [st, { value: s.flags, label: `${s.flags} open flags`, color: s.flags >= 10 ? 'red' : s.flags >= 5 ? 'orange' : s.flags >= 1 ? 'yellow' : 'green' }];
    const avg = Math.round(s.trust.reduce((a, b) => a + b, 0) / s.trust.length);
    return [st, { value: avg, label: `Average trust score ${avg}`, color: trustBand(avg).color }];
  }));

  const weekly = useMemo(() => {
    const by = countBy(active.filter((e) => e.admissionDate), (e) => {
      const d = new Date(e.admissionDate);
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().slice(0, 10);
    });
    return Object.entries(by).sort().map(([w, n]) => ({ week: w.slice(5), admissions: n }));
  }, [v, stateSel]);
  const cats = Object.entries(countBy(active, (e) => e.category)).map(([k, n]) => ({ name: CATEGORIES[k].label, value: n }));
  const fillBars = shown.map((m) => ({ name: m.inst.short, Regular: m.within, Free: Math.max(0, m.intake - m.within), Supernumerary: m.supern })).sort((a, b) => b.Regular - a.Regular);
  const worst = [...shown].sort((a, b) => a.trust.score - b.trust.score).slice(0, 5);

  return (
    <Page
      kicker={ROLES[user.role].label}
      title="Dashboard"
      subtitle={`${scopeLabel(user)} · Academic year ${rules.academicYear}-${String(rules.academicYear + 1).slice(2)}${stateSel ? ' · Filtered to ' + stateSel : ''}`}
      guide="dash-admin"
      actions={<>
        {stateSel && <button className="btn" onClick={() => setStateSel(null)}>✕ Clear state filter</button>}
        {user.role === 'aicte_admin' && <button className="btn primary" onClick={() => { const r = runRadar(user); toast(`Radar finished: ${r.total} flags, ${r.fresh} new`, 'good'); }}>◎ Run Radar now</button>}
      </>}
    >
      <div className="grid g6">
        <Stat label="Institutions" value={shown.length} color="red" onClick={() => nav('/app/institutions')} />
        <Stat label="Approved intake" value={intake.toLocaleString('en-IN')} hint="regular seats" color="orange" onClick={() => nav('/app/ledger')} />
        <Stat label="Students" value={active.length.toLocaleString('en-IN')} hint={`${within} regular · ${active.length - within} supernum.`} color="yellow" onClick={() => nav('/app/students')} />
        <Stat label="AICTE-verified" value={pct(verified, active.length) + '%'} hint={`${verified} records`} color="green" onClick={() => nav('/app/batches')} />
        <Stat label="Open flags" value={flags.length} hint={`${flags.filter((f) => f.severity === 'hold').length} on hold`} color="red" onClick={() => nav('/app/flags')} />
        <Stat label="Over-intake blocked" value={blocked} hint="attempts stopped by ledger" color="teal" onClick={() => nav('/app/ledger')} />
      </div>

      {pending.length > 0 && (
        <Callout kind="warn" title={`${pending.length} signed batch(es) waiting for your verification`}>
          {pending.slice(0, 4).map((b) => <span key={b.id}><Link to={`/app/batches/${b.id}`}>{db.get('institutions', b.institutionId)?.short} · {b.accepted} records</Link>{' · '}</span>)}
        </Callout>
      )}

      <div className="grid g3 mt">
        <Card title="India map" sub="Click a state to filter everything on this page" actions={
          <select className="input" style={{ width: 'auto' }} value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Map metric">
            <option value="fill">Seat fill %</option><option value="flags">Open flags</option><option value="trust">Avg trust score</option>
          </select>}>
          <IndiaMap values={mapValues} selected={stateSel} onSelect={setStateSel} caption="Grey states have no colleges in this demo dataset." />
        </Card>
        <Card title="Admissions per week" sub="By admission date (current year), week starting" className="span2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekly} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid stroke="#e3d5b5" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={ax} /><YAxis tick={ax} />
              <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
              <RBar dataKey="admissions" name="Admissions (week starting)" fill="#e2ac1c" stroke="#2a1d15" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid g3 mt">
        <Card title="Seat use by institution" sub="Regular seats filled vs free, plus supernumerary" className="span2">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={fillBars} margin={{ top: 8, right: 8, left: -10, bottom: 40 }}>
              <CartesianGrid stroke="#e3d5b5" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ ...ax, fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={ax} />
              <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
              <RBar dataKey="Regular" stackId="a" fill="#3c7a47" stroke="#2a1d15" />
              <RBar dataKey="Free" stackId="a" fill="#f3e8cf" stroke="#2a1d15" />
              <RBar dataKey="Supernumerary" fill="#dc7424" stroke="#2a1d15" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Category mix" sub="Current students">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={cats} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} stroke="#2a1d15" strokeWidth={1.5}>
                {cats.map((c, i) => <Cell key={c.name} fill={PALETTE[i % PALETTE.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid g2 mt">
        <Card title="Inspect first" sub="Lowest Trust Scores" actions={<Link className="btn sm" to="/app/inspection">Planner →</Link>}>
          {worst.map((m) => (
            <div key={m.inst.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)' }}>
              <Badge color={m.trust.band.color}>{m.trust.score}</Badge>
              <Link to={`/app/institutions/${m.inst.id}`} style={{ flex: 1 }}>{m.inst.name}</Link>
              <span className="small muted">{m.flags.length} flag(s)</span>
            </div>
          ))}
        </Card>
        <Card title="Latest flags" sub={radar ? `Radar last run ${fmtDateTime(radar.lastRunAt)} by ${radar.lastRunBy}` : ''} actions={<Link className="btn sm" to="/app/flags">All flags →</Link>}>
          {flags.slice().sort((a, b) => b.score - a.score).slice(0, 6).map((f) => (
            <div key={f.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)', alignItems: 'flex-start' }}>
              <Badge color={f.severity === 'hold' ? 'red' : 'orange'}>{f.code}</Badge>
              <span className="small" style={{ flex: 1 }}>{f.reason.slice(0, 140)}{f.reason.length > 140 ? '…' : ''}</span>
            </div>
          ))}
          {!flags.length && <div className="empty">No open flags.</div>}
        </Card>
      </div>
    </Page>
  );
}

function InstDash({ user }) {
  const v = useStore();
  const nav = useNavigate();
  const rules = db.rules();
  const inst = db.get('institutions', user.institutionId);
  const trust = trustAll(v).get(inst.id);
  const m = instMetrics(inst, rules);
  const batches = visibleBatches(user);
  const drafts = batches.filter((b) => b.status === 'draft' && b.accepted > 0);
  const rejected = batches.reduce((s, b) => s + (b.rejectedRows?.length || 0), 0);
  const flags = visibleFlags(user).filter((f) => ['open', 'review'].includes(f.status));
  const held = m.active.filter((e) => e.recordState === 'on_hold');
  const todo = [
    drafts.length && { t: `${drafts.length} batch(es) not yet submitted to AICTE`, to: `/app/batches/${drafts[0].id}`, c: 'orange', btn: user.role === 'institution_admin' ? 'Sign & submit' : 'Open' },
    rejected && { t: `${rejected} rejected row(s) to fix`, to: '/app/batches', c: 'red', btn: 'Fix rows' },
    flags.length && { t: `${flags.length} open flag(s) on your records`, to: '/app/flags', c: 'red', btn: user.role === 'institution_admin' ? 'Respond' : 'View' },
    held.length && { t: `${held.length} admission(s) on hold: student active at another college`, to: '/app/students?state=on_hold', c: 'red', btn: 'Review' },
  ].filter(Boolean);
  return (
    <Page kicker={ROLES[user.role].label} title="Dashboard" subtitle={`${inst.name}, ${inst.city} · AICTE ID ${inst.aicteId}`} guide="dash-inst"
      actions={<><Link className="btn primary" to="/app/upload">⇪ Upload students</Link><Link className="btn" to="/app/ledger">Seat Ledger</Link></>}>
      <div className="grid g4">
        <Stat label="Approved intake" value={m.intake} hint={`${m.progs.length} programmes`} color="orange" />
        <Stat label="Regular seats filled" value={`${m.within}/${m.intake}`} hint={`${m.fillPct}%`} color="green" onClick={() => nav('/app/ledger')} />
        <Stat label="Supernumerary" value={`${m.supern}/${m.supernCap}`} hint="TFW, FN/OCI, PMSSS, lateral" color="yellow" />
        <Stat label="Trust score" value={trust.score} hint={trust.band.label} color={trust.band.color} onClick={() => nav('/app/trust')} />
      </div>
      <div className="grid g2 mt">
        <Card title="To do" accent="red">
          {todo.length ? todo.map((x) => (
            <div key={x.t} className="row" style={{ padding: '8px 0', borderBottom: '1px dashed var(--line-soft)' }}>
              <span className="dot" style={{ background: `var(--${x.c})` }} />
              <span style={{ flex: 1 }}>{x.t}</span>
              <Link className="btn sm sun" to={x.to}>{x.btn} →</Link>
            </div>
          )) : <div className="empty">All clear. Nothing waiting for you. ✓</div>}
        </Card>
        <Card title="Seats by programme" sub="Regular (within intake) seats">
          {m.progs.map((p) => {
            const o = occupancy(p, rules);
            return (
              <div key={p.id} className="mb">
                <div className="row between small"><b>{p.course}</b><span className="mono">{p.code}</span></div>
                <Bar value={o.used.W} max={o.cap.W} thick label={`${o.used.W}/${o.cap.W}`} color={o.used.W >= o.cap.W ? 'var(--orange)' : 'var(--green)'} />
                <div className="tiny muted mt-s">TFW {o.used.T}/{o.cap.T} · FN/OCI {o.used.F}/{o.cap.F} · PMSSS {o.used.P}/{o.cap.P} · Lateral {o.used.L}/{o.cap.L} · NRI {o.used.NRI}/{o.cap.nriCap}</div>
              </div>
            );
          })}
        </Card>
      </div>
      <div className="mt">
        <Card title="Recent batches" actions={<Link className="btn sm" to="/app/batches">All batches →</Link>}>
          <Table rows={batches.slice(0, 5)} onRowClick={(b) => nav(`/app/batches/${b.id}`)} columns={[
            { key: 'at', label: 'Uploaded', render: (b) => fmtDate(b.at) },
            { key: 'fileName', label: 'File / source', render: (b) => b.fileName || b.source },
            { key: 'accepted', label: 'Accepted', num: true },
            { key: 'rejected', label: 'Rejected', num: true, render: (b) => b.rejected ? <Badge color="red">{b.rejected}</Badge> : 0 },
            { key: 'status', label: 'Status', render: (b) => <BatchStatus b={b} /> },
          ]} />
        </Card>
      </div>
    </Page>
  );
}

export const BatchStatus = ({ b }) => <Badge color={{ draft: 'yellow', submitted: 'orange', verified: 'green' }[b.status]}>{{ draft: 'Draft', submitted: 'Submitted · signed', verified: 'AICTE-verified' }[b.status]}</Badge>;

function VerifierDash({ user }) {
  useStore();
  const mine = db.where('consents', (c) => c.requesterId === user.id);
  const by = countBy(mine, (c) => effectiveStatus(c));
  return (
    <Page kicker={`Verifier · ${user.org}`} title="Dashboard" subtitle="Verify certificates instantly, or ask a student for consent to see specific details.">
      <div className="grid g4">
        <Stat label="Requests sent" value={mine.length} color="orange" />
        <Stat label="Granted" value={by.granted || 0} color="green" />
        <Stat label="Pending" value={by.pending || 0} color="yellow" />
        <Stat label="Denied / revoked / expired" value={(by.denied || 0) + (by.revoked || 0) + (by.expired || 0)} color="red" />
      </div>
      <div className="grid g2 mt">
        <Card title="Verify a certificate" accent="green">
          <p>Scan the QR printed on a certificate or paste the link a student sent you. The check is instant and works offline.</p>
          <Link className="btn go" to="/verify">✔ Verify now</Link>
        </Card>
        <Card title="Request consented access" accent="orange">
          <p>Need details that are not on the certificate? Send a purpose-bound request. The student decides; every access is logged.</p>
          <Link className="btn warn" to="/app/requests">⇄ New request</Link>
        </Card>
      </div>
    </Page>
  );
}

export { VCODES };
