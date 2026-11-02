import { useMemo, useState } from 'react';
import { Page, Card, Table, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore } from '../data/store';
import { visibleInstitutions } from '../data/scope';
import { REPORTS, buildReport, exportXlsx, exportCsv } from '../services/reports';
import { ask } from '../services/assistant';
import { audit } from '../services/audit';

export default function Reports() {
  const v = useStore();
  const { user } = useSession();
  const avail = Object.entries(REPORTS).filter(([, r]) => r.for.includes(user.role));
  const [type, setType] = useState(avail[0][0]);
  const [q, setQ] = useState('');
  const [ans, setAns] = useState(null);
  const report = useMemo(() => buildReport(type, visibleInstitutions(user)), [type, v]);
  const sheet = report.sheets[0];
  const cols = sheet?.rows.length ? Object.keys(sheet.rows[0]) : [];
  const name = `${type}_report_${new Date().toISOString().slice(0, 10)}`;
  return (
    <Page title="Reports" subtitle="For policy, accreditation, monitoring and regulation, built from the same verified records." guide="reports"
      actions={<>
        <button className="btn" onClick={() => { exportCsv(name + '.csv', sheet.rows); audit(user, 'REPORT_EXPORT', 'report:' + type, { detail: 'csv' }); }}>⬇ CSV</button>
        <button className="btn sun" onClick={() => { exportXlsx(name + '.xlsx', report); audit(user, 'REPORT_EXPORT', 'report:' + type, { detail: 'xlsx' }); }}>⬇ Excel</button>
        <button className="btn" onClick={() => window.print()}>⎙ Print / PDF</button>
      </>}>
      <div className="grid g4 no-print">
        {avail.map(([k, r]) => (
          <button key={k} className="role-card" style={{ background: k === type ? 'var(--yellow)' : undefined }} onClick={() => setType(k)}>
            <span className="who">{r.title}</span>
            <span className="small muted" style={{ color: 'var(--ink-2)' }}>{r.desc}</span>
          </button>
        ))}
      </div>
      <Card title={REPORTS[type].title} className="mt" sub={`${sheet?.rows.length || 0} rows · generated ${new Date().toLocaleString('en-IN')} · ${user.name}`}>
        {sheet?.note && <Callout kind="info">{sheet.note}</Callout>}
        <Table rows={sheet?.rows.map((r, i) => ({ id: i, ...r })) || []} pageSize={25} search="Filter rows…" searchKeys={cols.slice(0, 3)}
          columns={cols.map((c) => ({ key: c, label: c, num: typeof sheet.rows[0][c] === 'number' }))} />
      </Card>
      <Card title="Ask a question in plain language" className="mt no-print" sub="Answers use only aggregated data you are allowed to see.">
        <form className="row" onSubmit={(e) => { e.preventDefault(); setAns(ask(q, user)); }}>
          <input className="input" style={{ flex: 1 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. How many OCI students in Karnataka?  ·  Students by state  ·  Lowest trust scores" />
          <button className="btn primary">Ask</button>
        </form>
        {ans && (
          <div className="callout info mt">
            <div style={{ whiteSpace: 'pre-wrap' }}>{ans.text}</div>
            {ans.table && <div className="table-wrap mt-s"><table className="tbl"><thead><tr>{ans.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{ans.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>}
          </div>
        )}
      </Card>
    </Page>
  );
}
