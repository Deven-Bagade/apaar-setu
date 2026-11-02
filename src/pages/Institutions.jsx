import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar as RBar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Page, Card, Table, Badge, Bar, Stat, KV, Callout, toast } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleInstitutions, visibleBatches, visibleFlags, canSeeInstitution } from '../data/scope';
import { instMetrics } from '../services/analytics';
import { trustAll } from '../services/trust';
import { occupancy } from '../services/ledger';
import { fmtDate } from '../lib/util';
import { BatchStatus } from './Dashboard';
import { refreshPublicStats } from '../services/publicStats';

export default function Institutions() {
  const v = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [state, setState] = useState('');
  const trust = trustAll(v);
  const rows = visibleInstitutions(user).map((i) => {
    const m = instMetrics(i);
    const t = trust.get(i.id);
    return { id: i.id, inst: i, name: i.name, city: i.city, state: i.state, aicteId: i.aicteId, intake: m.intake, within: m.within, supern: m.supern, fill: m.fillPct, flags: m.flags.length, trust: t.score, band: t.band, verified: m.active.length ? Math.round((m.verified / m.active.length) * 100) : 0 };
  });
  const states = [...new Set(rows.map((r) => r.state))];
  return (
    <Page title="Institutions" subtitle={`${rows.length} AICTE-approved institutions in your scope.`} guide="institutions">
      <Table
        rows={rows.filter((r) => !state || r.state === state)}
        search="Search name, city or AICTE ID…"
        searchKeys={['name', 'city', 'aicteId']}
        onRowClick={(r) => nav(`/app/institutions/${r.id}`)}
        initialSort={{ key: 'trust', dir: 'asc' }}
        toolbar={<select className="input" value={state} onChange={(e) => setState(e.target.value)} aria-label="State"><option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}</select>}
        columns={[
          { key: 'name', label: 'Institution', render: (r) => <><b>{r.name}</b><div className="small muted">{r.city}, {r.state} · <span className="mono">{r.aicteId}</span></div></> },
          { key: 'intake', label: 'Intake', num: true },
          { key: 'fill', label: 'Regular filled', render: (r) => <div style={{ minWidth: 110 }}><Bar value={r.within} max={r.intake} label={r.fill + '%'} color={r.fill >= 100 ? 'var(--orange)' : 'var(--green)'} /></div> },
          { key: 'supern', label: 'Supernum.', num: true },
          { key: 'verified', label: 'Verified', num: true, render: (r) => r.verified + '%' },
          { key: 'flags', label: 'Open flags', num: true, render: (r) => r.flags ? <Badge color="red">{r.flags}</Badge> : 0 },
          { key: 'trust', label: 'Trust', num: true, render: (r) => <Badge color={r.band.color}>{r.trust} · {r.band.label}</Badge> },
        ]}
      />
    </Page>
  );
}

export function InstitutionDetail() {
  const v = useStore();
  const { id } = useParams();
  const { user } = useSession();
  const nav = useNavigate();
  const inst = db.get('institutions', id);
  if (!inst || !canSeeInstitution(user, id)) return <Callout kind="bad" title="Not found">This institution is not in your scope.</Callout>;
  const m = instMetrics(inst);
  const t = trustAll(v).get(id);
  const flags = visibleFlags(user).filter((f) => (f.refs?.institutionIds || [f.institutionId]).includes(id));
  const batches = visibleBatches(user).filter((b) => b.institutionId === id);
  const hist = {};
  m.progs.forEach((p) => (p.history || []).forEach((h) => {
    hist[h.year] = hist[h.year] || { year: String(h.year), Admitted: 0, Withdrawn: 0 };
    hist[h.year].Admitted += h.admitted;
    hist[h.year].Withdrawn += h.dropped;
  }));
  const Y = db.rules().academicYear;
  hist[Y] = { year: String(Y) + ' (now)', Admitted: m.active.length + m.ens.filter((e) => e.status === 'dropped').length, Withdrawn: m.ens.filter((e) => e.status === 'dropped').length };
  const schedule = () => {
    db.put('institutions', { ...inst, inspection: { date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), officer: user.name, status: 'scheduled' } });
    refreshPublicStats(id);
    toast('Inspection scheduled in 14 days', 'good');
  };
  return (
    <Page kicker={`${inst.city}, ${inst.state}`} title={inst.name} subtitle={`AICTE ID ${inst.aicteId} · ${inst.type} · Est. ${inst.established}`}
      actions={<><Link className="btn" to={`/app/students?inst=${id}`}>Students</Link><Link className="btn" to={`/app/ledger?inst=${id}`}>Seat Ledger</Link>{!inst.inspection && <button className="btn primary" onClick={schedule}>Schedule inspection</button>}</>}>
      {inst.inspection && <Callout kind="warn" title={`Inspection ${inst.inspection.status} for ${fmtDate(inst.inspection.date)}`}>Officer: {inst.inspection.officer}</Callout>}
      <div className="grid g4">
        <Stat label="Trust score" value={t.score} hint={t.band.label} color={t.band.color} />
        <Stat label="Regular seats" value={`${m.within}/${m.intake}`} hint={m.fillPct + '% filled'} color="green" />
        <Stat label="Declared vs verified" value={`${m.declared ?? '—'} / ${m.active.length}`} hint="approval portal vs records" color={m.declared && Math.abs(m.declared - m.active.length) > 2 ? 'red' : 'yellow'} />
        <Stat label="Open flags" value={flags.filter((f) => f.status !== 'resolved' && f.status !== 'dismissed').length} color="red" />
      </div>
      <div className="grid g2 mt">
        <Card title="Trust score breakdown">
          {t.cap && <Callout kind="bad">{t.cap.why}</Callout>}
          {t.parts.map((p) => (
            <div key={p.key} className="mb">
              <div className="row between small"><b>{p.label}</b><span>{p.score} / {p.max}</span></div>
              <Bar value={p.score} max={p.max} color={p.score / p.max >= 0.8 ? 'var(--green)' : p.score / p.max >= 0.5 ? 'var(--yellow)' : 'var(--red)'} />
              <div className="tiny muted">{p.detail}</div>
            </div>
          ))}
        </Card>
        <Card title="Admissions history" sub="Admitted and withdrawn per year">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={Object.values(hist)} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke="#e3d5b5" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <RBar dataKey="Admitted" fill="#e2ac1c" stroke="#2a1d15" />
              <RBar dataKey="Withdrawn" fill="#c4372a" stroke="#2a1d15" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <div className="mt">
        <Card title="Programmes">
          <Table rows={m.progs} onRowClick={(p) => nav(`/app/ledger?prog=${p.id}`)} columns={[
            { key: 'course', label: 'Programme', render: (p) => <><b>{p.course}</b> <span className="mono small">{p.code}</span></> },
            { key: 'level', label: 'Level' },
            { key: 'approvedIntake', label: 'Approved intake', num: true },
            { key: 'w', label: 'Regular used', render: (p) => { const o = occupancy(p); return <div style={{ minWidth: 120 }}><Bar value={o.used.W} max={o.cap.W} label={`${o.used.W}/${o.cap.W}`} /></div>; } },
            { key: 's', label: 'Supernumerary used', render: (p) => { const o = occupancy(p); return `${o.used.T + o.used.F + o.used.P + o.used.L} / ${o.cap.T + o.cap.F + o.cap.P + o.cap.L}`; } },
          ]} />
        </Card>
      </div>
      <div className="grid g2 mt">
        <Card title="Flags" actions={<Link className="btn sm" to="/app/flags">Flags →</Link>}>
          {flags.length ? flags.map((f) => (
            <div key={f.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)', alignItems: 'flex-start' }}>
              <Badge color={f.status === 'resolved' || f.status === 'dismissed' ? 'grey' : f.severity === 'hold' ? 'red' : 'orange'}>{f.code}</Badge>
              <span className="small" style={{ flex: 1 }}>{f.reason}</span>
              <Badge color="grey">{f.status}</Badge>
            </div>
          )) : <div className="empty">No flags.</div>}
        </Card>
        <Card title="Batches and signing key">
          <KV items={[['Institution key', <span className="mono" key="k">{inst.keyFingerprint}</span>], ['Batches', batches.length]]} />
          <div className="mt-s">
            {batches.map((b) => (
              <div key={b.id} className="row" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line-soft)' }}>
                <Link to={`/app/batches/${b.id}`} style={{ flex: 1 }}>{fmtDate(b.at)} · {b.accepted} accepted, {b.rejected} rejected</Link>
                <BatchStatus b={b} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
