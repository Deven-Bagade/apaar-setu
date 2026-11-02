import { useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar as RBar } from 'recharts';
import { Page, Card, Table, Badge, Confirm, toast, Stat } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleInstitutions, visibleEnrolments } from '../data/scope';
import { cohortRisk, promote } from '../services/lifecycle';
import { countBy } from '../lib/util';
import { PALETTE } from './Dashboard';

export default function Lifecycle() {
  useStore();
  const { user } = useSession();
  const [sel, setSel] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const rules = db.rules();
  const insts = visibleInstitutions(user);
  const progs = db.where('programmes', (p) => insts.some((i) => i.id === p.institutionId) && p.academicYear === rules.academicYear);
  const risks = progs.map((p) => cohortRisk(p, rules)).sort((a, b) => b.risk - a.risk);
  const ens = visibleEnrolments(user).filter((e) => e.academicYear === rules.academicYear);
  const reasons = Object.entries(countBy(ens.filter((e) => e.status === 'dropped'), (e) => e.exitReason || 'Not given')).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  const pick = sel ? risks.find((r) => r.prog.id === sel) : risks[0];
  const chart = pick ? [...pick.hist.map((h) => ({ year: String(h.year), rate: Math.round((h.dropped / h.admitted) * 1000) / 10 })), { year: rules.academicYear + ' (term 1)', rate: Math.round(pick.cur * 1000) / 10 }] : [];
  return (
    <Page title="Lifecycle" subtitle="From admission to graduation: withdrawals, transfers, semesters and an early warning for dropouts." guide="lifecycle">
      <div className="grid g4">
        <Stat label="Active" value={ens.filter((e) => e.status === 'active').length} color="green" />
        <Stat label="Withdrawn this year" value={ens.filter((e) => e.status === 'dropped').length} color="red" />
        <Stat label="Transferred out" value={ens.filter((e) => e.status === 'transferred').length} color="orange" />
        <Stat label="High-risk programmes" value={risks.filter((r) => r.level === 'High').length} color="yellow" />
      </div>
      <div className="grid g3 mt">
        <Card className="span2" title="Dropout early warning" sub="Risk 0–100 from this term’s withdrawals (projected), the 3-year average and the trend. Click a row for the chart.">
          <Table rows={risks.map((r) => ({ ...r, id: r.prog.id }))} pageSize={10} onRowClick={(r) => setSel(r.id)} rowClass={(r) => (pick && r.id === pick.prog.id ? 'sel' : '')} columns={[
            { key: 'prog', label: 'Programme', render: (r) => <><b>{db.get('institutions', r.prog.institutionId)?.short}</b> · {r.prog.course}</> },
            { key: 'admitted', label: 'Admitted', num: true },
            { key: 'dropped', label: 'Withdrawn', num: true },
            { key: 'mean', label: '3-yr avg', num: true, render: (r) => Math.round(r.mean * 100) + '%' },
            { key: 'risk', label: 'Risk', num: true, render: (r) => <Badge color={r.level === 'High' ? 'red' : r.level === 'Medium' ? 'orange' : 'green'}>{r.risk} · {r.level}</Badge> },
            { key: 'reasons', label: 'Why', nosort: true, render: (r) => <span className="small">{r.reasons.join('; ') || '—'}</span> },
            ...(user.role === 'institution_admin' ? [{ key: 'act', label: '', nosort: true, render: (r) => <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); setConfirm(r.prog); }}>Promote semester</button> }] : []),
          ]} />
        </Card>
        <div className="col" style={{ gap: 16 }}>
          {pick && (
            <Card title="Attrition trend" sub={`${db.get('institutions', pick.prog.institutionId)?.short} · ${pick.prog.code}`}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chart} margin={{ top: 6, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="#e3d5b5" strokeDasharray="3 3" />
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
                  <Line dataKey="rate" name="Withdrawn %" stroke="#c4372a" strokeWidth={3} dot={{ r: 4, fill: '#e2ac1c', stroke: '#2a1d15' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
          <Card title="Why students left">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={reasons} layout="vertical" margin={{ top: 0, right: 10, left: 40, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                <Tooltip contentStyle={{ border: '2px solid #2a1d15', borderRadius: 2 }} />
                <RBar dataKey="n" name="Students" fill={PALETTE[1]} stroke="#2a1d15" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
      {confirm && <Confirm title={`Promote ${confirm.course}?`} body="All active students of this programme move to the next semester. The change is logged." confirmLabel="Promote" onClose={() => setConfirm(null)}
        onConfirm={() => { const n = promote(db.where('enrolments', (e) => e.programmeId === confirm.id && e.academicYear === rules.academicYear), user); toast(`${n} students promoted`, 'good'); }} />}
    </Page>
  );
}
