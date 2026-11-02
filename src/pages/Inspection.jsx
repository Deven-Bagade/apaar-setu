import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Table, Badge, Modal, Field, toast, Card } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleInstitutions } from '../data/scope';
import { trustAll } from '../services/trust';
import { audit } from '../services/audit';
import { notify } from '../services/notify';
import { fmtDate } from '../lib/util';

export default function Inspection() {
  const v = useStore();
  const { user } = useSession();
  const [sel, setSel] = useState(new Set());
  const [modal, setModal] = useState(false);
  const [date, setDate] = useState(new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10));
  const [officer, setOfficer] = useState(user.name);
  const trust = trustAll(v);
  const rows = visibleInstitutions(user).map((i) => ({ id: i.id, inst: i, t: trust.get(i.id) })).sort((a, b) => a.t.score - b.t.score);
  const toggle = (id) => setSel((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });
  const schedule = () => {
    [...sel].forEach((id) => {
      const inst = db.get('institutions', id);
      db.put('institutions', { ...inst, inspection: { date, officer, status: 'scheduled', by: user.name } });
      notify(id, `AICTE has scheduled a data inspection on ${fmtDate(date)} (officer: ${officer}). Please keep admission files ready.`, { title: 'Inspection scheduled' });
      audit(user, 'INSPECTION_SCHEDULE', 'institution:' + id, { detail: `${date} · ${officer}` });
    });
    toast(`${sel.size} inspection(s) scheduled`, 'good');
    setSel(new Set());
    setModal(false);
  };
  const share = Math.max(1, Math.round(rows.length * 0.1));
  return (
    <Page title="Inspection planner" subtitle={`Risk-based inspection: visit the colleges whose data is least trustworthy first. Suggested this cycle: the lowest ${share}.`} guide="inspection"
      actions={<button className="btn primary" disabled={!sel.size} onClick={() => setModal(true)}>Schedule {sel.size || ''} inspection(s)</button>}>
      <Card>
        <Table rows={rows} pageSize={20} columns={[
          { key: 'pick', label: '', nosort: true, render: (r) => <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.inst.name}`} /> },
          { key: 'rank', label: '#', render: (r) => rows.indexOf(r) + 1 },
          { key: 'name', label: 'Institution', render: (r) => <><Link to={`/app/institutions/${r.id}`}><b>{r.inst.name}</b></Link><div className="small muted">{r.inst.city}, {r.inst.state}</div></> },
          { key: 'score', label: 'Trust', render: (r) => <Badge color={r.t.band.color}>{r.t.score} · {r.t.band.label}</Badge>, sort: (r) => r.t.score },
          { key: 'why', label: 'What pulled the score down', nosort: true, render: (r) => (
            <div className="small">
              {r.t.cap && <div><b>{r.t.cap.why}</b></div>}
              {r.t.parts.filter((p) => p.score / p.max < 0.8).map((p) => <div key={p.key}>· {p.label}: {p.detail}</div>)}
              {!r.t.cap && r.t.parts.every((p) => p.score / p.max >= 0.8) && <span className="muted">Nothing significant</span>}
            </div>
          ) },
          { key: 'insp', label: 'Inspection', render: (r) => r.inst.inspection ? <Badge color="orange">{fmtDate(r.inst.inspection.date)}</Badge> : rows.indexOf(r) < share ? <Badge color="red">Suggested</Badge> : '—' },
        ]} />
      </Card>
      {modal && (
        <Modal title="Schedule inspection" onClose={() => setModal(false)} footer={<><button className="btn" onClick={() => setModal(false)}>Cancel</button><button className="btn primary" onClick={schedule}>Schedule</button></>}>
          <p>{[...sel].map((id) => db.get('institutions', id)?.name).join(', ')}</p>
          <div className="form-grid">
            <Field label="Date"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Officer"><input className="input" value={officer} onChange={(e) => setOfficer(e.target.value)} /></Field>
          </div>
          <p className="small muted mt-s">The institution is notified and the action is recorded in the audit trail.</p>
        </Modal>
      )}
    </Page>
  );
}
