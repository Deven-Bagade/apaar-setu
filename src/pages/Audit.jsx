import { useEffect, useRef, useState } from 'react';
import { Page, Card, Table, Badge, Callout, toast, Stat } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db, getMode, getBackend, forceRefresh } from '../data/store';
import { verifyChain, publishRoot, checkRoots } from '../services/audit';
import { fmtDateTime, today } from '../lib/util';

export default function Audit() {
  useStore();
  const { user } = useSession();
  const [res, setRes] = useState(null);
  const [roots, setRoots] = useState(null);
  const [tampered, setTampered] = useState(null);
  const tamperRef = useRef(null);
  useEffect(() => () => {
    // Leaving the page always undoes the simulated edit.
    const t = tamperRef.current;
    if (t) Object.assign(db.get('audit', t.id) || {}, t.original);
  }, []);
  useEffect(() => {
    if (getMode() === 'firebase') getBackend().loadCollection('audit').then((d) => d.length && db.setCollection('audit', d));
  }, []);
  const entries = [...db.all('audit')].sort((a, b) => b.seq - a.seq);
  const tamper = () => {
    const list = db.all('audit');
    const victim = list[Math.floor(list.length / 2)];
    tamperRef.current = { id: victim.id, original: { ...victim } };
    setTampered(tamperRef.current);
    Object.assign(victim, { detail: victim.detail + ' (edited later!)' });
    forceRefresh();
    setRes(null);
    setRoots(null);
    toast(`Entry #${victim.seq} was quietly edited in memory. Now verify the chain.`, 'bad');
  };
  const restore = () => {
    const victim = db.get('audit', tampered.id);
    Object.assign(victim, tampered.original);
    tamperRef.current = null;
    setTampered(null);
    forceRefresh();
    setRes(null);
    setRoots(null);
    toast('Original entry restored', 'good');
  };
  return (
    <Page title="Audit trail" subtitle="Append-only, hash-chained record of every write. Daily Merkle roots make back-dated edits provable." guide="audit"
      actions={<>
        <button className="btn primary" onClick={() => setRes(verifyChain())}>⛓ Verify chain</button>
        <button className="btn" onClick={() => setRoots(checkRoots())}>Check Merkle roots</button>
        <button className="btn sun" onClick={() => { const r = publishRoot(today(), user); toast(`Published today’s root over ${r.count} entries`, 'good'); }}>Publish today’s root</button>
        {!tampered ? <button className="btn warn" onClick={tamper}>Simulate tampering</button> : <button className="btn go" onClick={restore}>Restore entry</button>}
      </>}>
      <div className="grid g4">
        <Stat label="Entries" value={entries.length} color="yellow" />
        <Stat label="Head hash" value={<span className="hash" style={{ fontSize: 13 }}>{entries[0]?.hash.slice(0, 16)}…</span>} color="teal" />
        <Stat label="Published roots" value={db.all('merkle').length} color="green" />
        <Stat label="Chain status" value={res ? (res.ok ? 'Intact' : 'BROKEN') : '—'} color={res ? (res.ok ? 'green' : 'red') : 'orange'} />
      </div>
      {res && (res.ok
        ? <Callout kind="good" title="Chain intact">All {res.checked} entries re-hashed and linked correctly.</Callout>
        : <Callout kind="bad" title={`Chain broken at entry #${res.brokenAt}`}>{res.reason}. Entry: {res.entry.action} on {res.entry.object} by {res.entry.actorName}, {fmtDateTime(res.entry.at)}. Everything after this point can no longer be trusted until investigated.</Callout>)}
      {roots && (
        <Card title="Merkle roots" className="mt">
          <Table rows={roots} pageSize={8} initialSort={{ key: 'date', dir: 'desc' }} columns={[
            { key: 'date', label: 'Day' },
            { key: 'count', label: 'Entries', num: true },
            { key: 'root', label: 'Published root', render: (r) => <span className="hash">{r.root.slice(0, 24)}…</span> },
            { key: 'ok', label: 'Recomputed', render: (r) => <Badge color={r.ok ? 'green' : 'red'}>{r.ok ? 'matches' : 'MISMATCH'}</Badge> },
          ]} />
        </Card>
      )}
      <Card title="Entries" className="mt">
        <Table rows={entries} pageSize={15} search="Search action, object or person…" searchKeys={['action', 'object', 'actorName', 'detail']} rowClass={(e) => (tampered?.id === e.id ? 'bad' : '')} columns={[
          { key: 'seq', label: '#', num: true },
          { key: 'at', label: 'When', render: (e) => fmtDateTime(e.at) },
          { key: 'actorName', label: 'Who', render: (e) => <>{e.actorName}<div className="tiny muted">{e.role}</div></> },
          { key: 'action', label: 'Action', render: (e) => <span className="mono small">{e.action}</span> },
          { key: 'object', label: 'Object', render: (e) => <span className="mono small">{e.object}</span> },
          { key: 'detail', label: 'Detail', render: (e) => <span className="small">{e.detail}</span> },
          { key: 'hash', label: 'Hash → prev', render: (e) => <span className="hash">{e.hash.slice(0, 10)} → {e.prevHash.slice(0, 10)}</span> },
        ]} />
      </Card>
    </Page>
  );
}
