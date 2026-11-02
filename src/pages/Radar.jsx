import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Page, Card, Stat, Badge, Callout, toast } from '../components/ui';
import GraphView from '../components/GraphView';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleFlags } from '../data/scope';
import { VCODES } from '../lib/constants';
import { runRadar, graphFor } from '../services/radar';
import { countBy, fmtDateTime } from '../lib/util';

const GRAPHABLE = ['V04', 'V06', 'V11'];

export default function Radar() {
  const v = useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [code, setCode] = useState('V06');
  const [busy, setBusy] = useState(false);
  const flags = visibleFlags(user).filter((f) => ['open', 'review'].includes(f.status));
  const by = countBy(flags, (f) => f.code);
  const meta = db.get('settings', 'radar');
  const graph = useMemo(() => graphFor(flags.filter((f) => f.code === code)), [v, code]);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      const r = runRadar(user);
      setBusy(false);
      toast(`Scan complete: ${r.total} flags (${r.fresh} new)`, 'good');
    }, 50);
  };
  const instScores = meta?.instScores || {};
  return (
    <Page title="Ghost Student Radar" subtitle="Cross-institution anomaly detection. Each flag explains itself, so an officer can act instead of staring at a score." guide="radar"
      actions={user.role === 'aicte_admin' && <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Scanning…' : '◎ Run full scan'}</button>}>
      {meta && <p className="small muted">Last scan {fmtDateTime(meta.lastRunAt)} by {meta.lastRunBy} · {meta.found} flags.</p>}
      <div className="grid g6">
        {['V04', 'V11', 'V06', 'V07', 'V13', 'V14'].map((c) => (
          <Stat key={c} label={`${c} · ${VCODES[c].title}`} value={by[c] || 0} color={GRAPHABLE.includes(c) ? (code === c ? 'red' : 'orange') : 'yellow'} onClick={() => (GRAPHABLE.includes(c) ? setCode(c) : nav(`/app/flags?code=${c}`))} />
        ))}
      </div>
      <div className="grid g3 mt">
        <Card className="span2" title={`Network: ${code} · ${VCODES[code].title}`} sub="Click a stat tile above (V04, V11, V06) to switch. Click a student to open the record."
          actions={<div className="row">{GRAPHABLE.map((c) => <button key={c} className={`btn sm ${code === c ? 'sun' : ''}`} onClick={() => setCode(c)}>{c}</button>)}</div>}>
          <GraphView graph={graph} onNode={(n) => {
            if (n.kind === 'student') {
              const e = db.find('enrolments', (x) => 'S' + x.apaarId === n.id);
              if (e) nav(`/app/students/${e.id}`);
            }
            if (n.kind === 'institution') nav(`/app/institutions/${n.id.slice(1)}`);
          }} />
        </Card>
        <Card title="How the Radar decides">
          <div className="pill-steps small">
            <div><b>V04 · same APAAR, two colleges.</b> Checked at upload through a privacy-safe APAAR index and again in every scan.</div>
            <div><b>V11 · look-alike identities.</b> Same date of birth and guardian, names ≥ {Math.round(db.rules().fuzzyDupMin * 100)}% similar after folding spelling variants (sh/s, ee/i, w/v…), different APAAR IDs.</div>
            <div><b>V06 · shared contacts.</b> More than {db.rules().sharedContactMax} students on one phone or bank account, compared through salted hashes.</div>
            <div><b>V07 / V13 · numbers that do not add up.</b> Enrolment jumps &gt; {db.rules().yoyJumpPct}% year on year; declared totals that differ from verified records.</div>
            <div><b>V14 · Isolation Forest.</b> 150 random trees over 5 institution features: fill rate, foreign share, YoY growth, attrition now and last year.</div>
          </div>
        </Card>
      </div>
      <Card title="Isolation Forest scores by institution" className="mt" sub={`Above ${db.rules().outlierScoreMin} is raised as V14`}>
        <div className="grid g4">
          {Object.entries(instScores).sort((a, b) => b[1] - a[1]).filter(([id]) => db.get('institutions', id) && visibleFlags(user) && (user.role === 'aicte_admin' || db.get('institutions', id).region === user.region)).map(([id, s]) => (
            <div key={id} className="row" style={{ padding: '4px 0' }}>
              <Badge color={s >= db.rules().outlierScoreMin ? 'red' : s >= 0.55 ? 'yellow' : 'green'}>{s.toFixed(2)}</Badge>
              <Link to={`/app/institutions/${id}`} className="small">{db.get('institutions', id).short}</Link>
            </div>
          ))}
        </div>
      </Card>
      <Card title="All open flags" className="mt" actions={<Link className="btn sm" to="/app/flags">Review in Flags →</Link>}>
        {flags.length ? flags.sort((a, b) => b.score - a.score).slice(0, 12).map((f) => (
          <div key={f.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)', alignItems: 'flex-start' }}>
            <Badge color={f.severity === 'hold' ? 'red' : 'orange'}>{f.code}</Badge>
            <span className="small" style={{ flex: 1 }}>{f.reason}</span>
            <Link className="btn sm" to={`/app/flags?id=${f.id}`}>Open</Link>
          </div>
        )) : <Callout kind="good">No open flags in your scope.</Callout>}
      </Card>
    </Page>
  );
}
