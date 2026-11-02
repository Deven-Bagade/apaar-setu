import { useState } from 'react';
import { Page, Table, Badge, Bar, Callout } from '../../components/ui';
import { publicList } from '../../services/publicStats';
import { useStore, db } from '../../data/store';
import { ALL_STATES, CATEGORIES } from '../../lib/constants';

export default function Transparency() {
  useStore();
  const [state, setState] = useState('');
  const rows = publicList().filter((r) => !state || r.state === state);
  return (
    <Page kicker="Public" title="Transparency" subtitle="Seat use and data quality for every AICTE-approved college in this demo. Aggregates only: no names, no IDs, and counts under 5 are shown as “<5”.">
      <Callout kind="info" title="Why this page exists">Students and parents can check, before admission, whether a college fills its seats within the approved intake and keeps clean records.</Callout>
      <Table
        rows={rows}
        search="Search college or city…"
        searchKeys={['name', 'city', 'aicteId']}
        toolbar={
          <select className="input" value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
            <option value="">All states</option>
            {ALL_STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
        }
        columns={[
          { key: 'name', label: 'Institution', render: (r) => <><b>{r.name}</b><div className="small muted">{r.city}, {r.state} · <span className="mono">{r.aicteId}</span></div></> },
          { key: 'approvedIntake', label: 'Approved seats', num: true },
          { key: 'within', label: 'Regular seats filled', num: true, render: (r) => <div style={{ minWidth: 120 }}><Bar value={r.within} max={r.approvedIntake} label={`${r.fillPct}%`} color={r.fillPct > 100 ? 'var(--red)' : 'var(--green)'} /><span className="small">{r.within} / {r.approvedIntake}</span></div> },
          { key: 'supernumerary', label: 'Supernumerary', num: true },
          { key: 'verifiedPct', label: 'AICTE-verified', num: true, render: (r) => r.verifiedPct + '%' },
          { key: 'mix', label: 'Category mix', nosort: true, render: (r) => <div className="row" style={{ gap: 4 }}>{Object.entries(r.categoryMix || {}).map(([k, v]) => <span key={k} className="badge grey" title={CATEGORIES[k]?.label}>{k} {v}</span>)}</div> },
          { key: 'trustBand', label: 'Data trust', render: (r) => <Badge color={r.trustColor}>{r.trustBand}</Badge> },
        ]}
      />
      <p className="small muted mt">Last updated: {rows[0]?.updatedAt ? new Date(rows[0].updatedAt).toLocaleString('en-IN') : '—'}. Programmes: {db.all('programmes').length}.</p>
    </Page>
  );
}
