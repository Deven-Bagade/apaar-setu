import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, Table, Badge, Modal, KV, Field, toast, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleFlags } from '../data/scope';
import { VCODES } from '../lib/constants';
import { resolveFlag } from '../services/radar';
import { fmtDate, fmtDateTime } from '../lib/util';
import { notify } from '../services/notify';
import { audit } from '../services/audit';

const SEV = { hold: 'red', flag: 'orange', block: 'yellow' };
const ST = { open: 'red', review: 'yellow', resolved: 'green', dismissed: 'grey' };

export default function Flags() {
  useStore();
  const { user } = useSession();
  const [sp, setSp] = useSearchParams();
  const [status, setStatus] = useState('active');
  const code = sp.get('code') || '';
  const all = visibleFlags(user);
  const rows = all.filter((f) => (status === 'active' ? ['open', 'review'].includes(f.status) : !status || f.status === status) && (!code || f.code === code));
  const open = sp.get('id') ? db.get('flags', sp.get('id')) : null;
  const setParam = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  return (
    <Page title="Flags" subtitle="Everything the validation engine and the Radar raised, with the reason in plain language." guide="flags">
      <Table rows={rows} onRowClick={(f) => setParam('id', f.id)} search="Search reason or institution…" searchKeys={['reason', 'code', (f) => db.get('institutions', f.institutionId)?.name]}
        initialSort={{ key: 'score', dir: 'desc' }}
        toolbar={<>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="active">Open + under review</option><option value="">All</option><option value="open">Open</option><option value="review">Under review</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select>
          <select className="input" value={code} onChange={(e) => setParam('code', e.target.value)} aria-label="Code"><option value="">All codes</option>{['V04', 'V06', 'V07', 'V11', 'V12', 'V13', 'V14'].map((c) => <option key={c} value={c}>{c} · {VCODES[c].title}</option>)}</select>
        </>}
        columns={[
          { key: 'code', label: 'Code', render: (f) => <Badge color={SEV[f.severity]}>{f.code}</Badge> },
          { key: 'reason', label: 'Why it was raised', render: (f) => <span className="small">{f.reason.length > 170 ? f.reason.slice(0, 170) + '…' : f.reason}</span> },
          { key: 'inst', label: 'Institution', render: (f) => db.get('institutions', f.institutionId)?.short, sort: (f) => db.get('institutions', f.institutionId)?.short },
          { key: 'score', label: 'Score', num: true, render: (f) => (f.score || 0).toFixed(2) },
          { key: 'status', label: 'Status', render: (f) => <Badge color={ST[f.status]}>{f.status}</Badge> },
          { key: 'createdAt', label: 'Raised', render: (f) => fmtDate(f.createdAt) },
        ]} />
      {open && <FlagModal flag={open} user={user} onClose={() => setParam('id', '')} />}
    </Page>
  );
}

function FlagModal({ flag, user, onClose }) {
  const [note, setNote] = useState('');
  const staff = ['aicte_admin', 'regional_officer'].includes(user.role);
  const ens = (flag.refs?.enrolmentIds || []).map((id) => db.get('enrolments', id)).filter(Boolean);
  const act = (a) => {
    if (['resolve', 'dismiss'].includes(a) && note.trim().length < 5) return toast('Add a short note explaining the decision', 'bad');
    resolveFlag(flag, a, note, user);
    toast(`Flag ${a === 'review' ? 'moved to review' : a + 'd'}`, 'good');
    setNote('');
    if (a !== 'review') onClose();
  };
  const respond = () => {
    if (note.trim().length < 5) return toast('Write your response first', 'bad');
    db.put('flags', { ...flag, history: [...(flag.history || []), { at: new Date().toISOString(), by: user.name, action: 'institution response', note }] });
    notify('AICTE', `${db.get('institutions', user.institutionId)?.short} responded on flag ${flag.code}: ${note}`, { title: 'Institution response', channel: 'inapp' });
    audit(user, 'FLAG_RESPONSE', 'flag:' + flag.id, { detail: note });
    toast('Response sent to AICTE', 'good');
    setNote('');
  };
  return (
    <Modal wide title={`${flag.code} · ${flag.title}`} onClose={onClose}
      footer={staff ? <>
        {flag.status === 'open' && <button className="btn sun" onClick={() => act('review')}>Start review</button>}
        <button className="btn" onClick={() => act('dismiss')}>Dismiss (false positive)</button>
        <button className="btn go" onClick={() => act('resolve')}>Resolve</button>
      </> : <button className="btn primary" onClick={respond}>Send response to AICTE</button>}>
      <Callout kind={flag.severity === 'hold' ? 'bad' : 'warn'} title="Why this was raised">{flag.reason}</Callout>
      <KV items={[
        ['Severity', <Badge color={SEV[flag.severity]} key="s">{flag.severity}</Badge>],
        ['Status', <Badge color={ST[flag.status]} key="t">{flag.status}</Badge>],
        ['Institution(s)', (flag.refs?.institutionIds || [flag.institutionId]).map((i) => db.get('institutions', i)?.name).join(', ')],
        ['Score', (flag.score || 0).toFixed(2)],
        flag.assignedTo && ['Reviewer', flag.assignedTo],
        flag.resolution && ['Resolution', flag.resolution],
      ]} />
      {ens.length > 0 && (
        <>
          <h3 className="mt">Records involved</h3>
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Student</th><th>APAAR</th><th>Institution</th><th>Programme</th><th>State</th></tr></thead>
            <tbody>{ens.map((e) => <tr key={e.id}><td><Link to={`/app/students/${e.id}`}>{e.name}</Link></td><td className="mono small">{e.apaarId}</td><td>{db.get('institutions', e.institutionId)?.short}</td><td>{e.programmeCode}</td><td>{e.recordState.replace(/_/g, '-')}</td></tr>)}</tbody></table></div>
        </>
      )}
      {flag.refs?.claimIds && <p className="mt"><Link to="/app/scholarships">See the {flag.refs.claimIds.length} scholarship claim(s) →</Link></p>}
      <h3 className="mt">History</h3>
      {(flag.history || []).map((h, i) => <div key={i} className="small" style={{ padding: '3px 0' }}><span className="muted">{fmtDateTime(h.at)}</span> · <b>{h.by}</b> · {h.action}{h.note ? ': ' + h.note : ''}</div>)}
      <div className="mt">
        <Field label={staff ? 'Decision note' : 'Your response'} help={staff ? 'Required to resolve or dismiss; visible to the institution.' : 'Explain what happened and what you did about it.'}>
          <textarea className="input" style={{ fontFamily: 'var(--font)' }} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
