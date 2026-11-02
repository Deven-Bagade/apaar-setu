import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Page, Card, Table, Badge, KV, Modal, Field, Callout, toast, Confirm } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleEnrolments, visibleInstitutions, visibleFlags, canSeeInstitution } from '../data/scope';
import { CATEGORIES, RECORD_STATES, STATUS } from '../lib/constants';
import { decryptField, mask } from '../lib/crypto';
import { fmtDate, fmtDateTime } from '../lib/util';
import { updateEnrolment } from '../services/enrolment';
import { changeStatus } from '../services/lifecycle';
import { issueCredential, revokeCredential, pushToDigiLocker } from '../services/credentials';
import { logAccess } from '../services/consent';

export const StateBadge = ({ s }) => <Badge color={RECORD_STATES[s]?.color || 'grey'}>{RECORD_STATES[s]?.label || s}</Badge>;
export const StatusBadge = ({ s }) => <Badge color={{ active: 'green', dropped: 'grey', graduated: 'teal', transferred: 'orange' }[s]}>{STATUS[s] || s}</Badge>;

export default function Students() {
  useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const f = Object.fromEntries(sp.entries());
  const set = (k, v) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  const insts = visibleInstitutions(user);
  const all = visibleEnrolments(user);
  const progs = [...new Set(all.map((e) => e.programmeCode))];
  const rows = all.filter((e) =>
    (!f.inst || e.institutionId === f.inst) && (!f.prog || e.programmeCode === f.prog) && (!f.cat || e.category === f.cat) &&
    (!f.status || e.status === f.status) && (!f.state || e.recordState === f.state) && (f.year === 'all' || f.status === 'graduated' || e.academicYear === db.rules().academicYear || !!f.status));
  return (
    <Page title="Students" subtitle={`${rows.length.toLocaleString('en-IN')} record(s) match. Each record is one APAAR ID holding one seat.`} guide="students"
      actions={['institution_admin', 'data_clerk'].includes(user.role) && <Link className="btn primary" to="/app/upload">⇪ Add students</Link>}>
      <Table
        rows={rows}
        search="Search name, APAAR ID or roll number…"
        searchKeys={['name', 'apaarId', 'instStudentId']}
        onRowClick={(e) => nav(`/app/students/${e.id}`)}
        toolbar={<>
          {insts.length > 1 && <select className="input" value={f.inst || ''} onChange={(e) => set('inst', e.target.value)} aria-label="Institution"><option value="">All institutions</option>{insts.map((i) => <option key={i.id} value={i.id}>{i.short}</option>)}</select>}
          <select className="input" value={f.prog || ''} onChange={(e) => set('prog', e.target.value)} aria-label="Programme"><option value="">All programmes</option>{progs.map((p) => <option key={p}>{p}</option>)}</select>
          <select className="input" value={f.cat || ''} onChange={(e) => set('cat', e.target.value)} aria-label="Category"><option value="">All categories</option>{Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}</select>
          <select className="input" value={f.status || ''} onChange={(e) => set('status', e.target.value)} aria-label="Status"><option value="">Current year</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select className="input" value={f.state || ''} onChange={(e) => set('state', e.target.value)} aria-label="Record state"><option value="">Any record state</option>{Object.entries(RECORD_STATES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        </>}
        columns={[
          { key: 'name', label: 'Student', render: (e) => <><b>{e.name}</b><div className="mono tiny muted">{e.apaarId}</div></> },
          { key: 'instStudentId', label: 'Roll no.', render: (e) => <span className="mono small">{e.instStudentId}</span> },
          ...(insts.length > 1 ? [{ key: 'institutionId', label: 'Institution', render: (e) => db.get('institutions', e.institutionId)?.short }] : []),
          { key: 'programmeCode', label: 'Programme', render: (e) => <span className="mono">{e.programmeCode}</span> },
          { key: 'category', label: 'Category', render: (e) => <span title={CATEGORIES[e.category].label}>{e.category}</span> },
          { key: 'slotLabel', label: 'Seat', render: (e) => <span className="mono">{e.slotLabel}</span> },
          { key: 'status', label: 'Status', render: (e) => <StatusBadge s={e.status} /> },
          { key: 'recordState', label: 'Record state', render: (e) => <StateBadge s={e.recordState} /> },
        ]}
      />
    </Page>
  );
}

const PIPE = ['apaar_verified', 'ledger_accepted', 'aicte_verified'];

export function RecordStepper({ e }) {
  const idx = PIPE.indexOf(e.recordState);
  return (
    <div className="stepper">
      <div className="step done">Uploaded<small>{fmtDate(e.createdAt)}</small></div>
      <div className="step done">Pre-validated<small>Layer 1 rules</small></div>
      {e.recordState === 'on_hold'
        ? <div className="step hold">On hold<small>{e.holdReason || 'Under review'}</small></div>
        : PIPE.map((s, i) => <div key={s} className={`step ${i < idx || (i === idx && s === 'aicte_verified') ? 'done' : i === idx ? 'done' : i === idx + 1 ? 'now' : ''}`}>{RECORD_STATES[s].label}<small>{i <= idx ? '✓' : i === idx + 1 ? 'next' : ''}</small></div>)}
    </div>
  );
}

export function StudentDetail() {
  useStore();
  const { id } = useParams();
  const { user } = useSession();
  const nav = useNavigate();
  const e = db.get('enrolments', id);
  const logged = useRef(false);
  const [edit, setEdit] = useState(false);
  const [statusModal, setStatusModal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => {
    if (e && !logged.current && ['aicte_admin', 'regional_officer'].includes(user.role)) {
      logged.current = true;
      logAccess({ apaarId: e.apaarId, actor: user, org: 'AICTE', purpose: 'Regulatory monitoring: record view', fields: ['all'], basis: 'Legal basis: AICTE Act 1987 (regulatory)' });
    }
  }, [e?.id]);
  if (!e || !canSeeInstitution(user, e.institutionId)) return <Callout kind="bad" title="Not found">This record is not in your scope.</Callout>;
  const inst = db.get('institutions', e.institutionId);
  const canSeeContact = ['aicte_admin', 'institution_admin', 'data_clerk'].includes(user.role);
  const isInst = ['institution_admin', 'data_clerk'].includes(user.role);
  const isAdmin = user.role === 'institution_admin';
  const flags = visibleFlags(user).filter((f) => (f.refs?.enrolmentIds || []).includes(e.id) || (f.refs?.apaarIds || []).includes(e.apaarId));
  const creds = db.where('credentials', (c) => c.enrolmentId === e.id);
  const others = db.where('enrolments', (x) => x.apaarId === e.apaarId && x.id !== e.id && canSeeInstitution(user, x.institutionId));
  const history = db.where('audit', (a) => a.object === 'enrolment:' + e.id).sort((a, b) => b.seq - a.seq);
  const ledger = db.where('ledger', (l) => l.apaarId === e.apaarId && l.programmeId === e.programmeId);
  const phone = decryptField(e.phoneEnc);
  const bank = decryptField(e.bankEnc);

  const issue = (type) => {
    issueCredential(e, type, user);
    toast(`${type} credential issued and sent to the student`, 'good');
  };

  return (
    <Page kicker={`${inst.name} · ${e.course}`} title={e.name} subtitle={`APAAR ${e.apaarId} · Roll ${e.instStudentId} · Seat ${e.slotLabel}`}
      actions={<>
        <button className="btn" onClick={() => nav(-1)}>← Back</button>
        {isInst && e.status === 'active' && <button className="btn" onClick={() => setEdit(true)}>✎ Correct data</button>}
        {isAdmin && e.status === 'active' && <button className="btn warn" onClick={() => setStatusModal('dropped')}>Withdraw</button>}
        {isAdmin && e.status === 'active' && <button className="btn" onClick={() => setStatusModal('transferred')}>Transfer out</button>}
        {isAdmin && e.status === 'active' && <button className="btn go" onClick={() => setStatusModal('graduated')}>Mark graduated</button>}
      </>}>
      <RecordStepper e={e} />
      {e.recordState === 'on_hold' && <Callout kind="bad" title="Admission on hold (V04)">{e.holdReason}. {isAdmin ? 'If this student has left the other college, ask them to withdraw there; if the student is not joining you, withdraw this admission to free the seat.' : 'Review the linked flag.'}</Callout>}
      <div className="grid g2 mt">
        <Card title="Identity (checked with ABC)">
          <KV items={[
            ['APAAR ID', <span className="mono" key="a">{e.apaarId}</span>],
            ['Name', e.name],
            ['Date of birth', e.dob],
            ['Gender', { M: 'Male', F: 'Female', O: 'Other' }[e.gender]],
            ['Guardian', e.guardian],
            ['Nationality', e.nationality],
            ['ABC name match', Math.round((e.nameScore || 0) * 100) + '%'],
            ['Phone', canSeeContact ? phone : mask(phone)],
            ['Bank account', canSeeContact ? (bank ? mask(bank) : '') : mask(bank)],
            ['Email', canSeeContact ? e.email : e.email ? mask(e.email, 10) : ''],
          ]} />
          <p className="tiny muted mt-s">Phone and bank numbers are stored encrypted. Matching across colleges uses salted hashes only.</p>
        </Card>
        <Card title="Admission">
          <KV items={[
            ['Institution', inst.name],
            ['Programme', `${e.course} (${e.programmeCode})`],
            ['Academic year', e.academicYear],
            ['Category', CATEGORIES[e.category].label],
            ['Seat slot', <span className="mono" key="s">{e.slotLabel}</span>],
            ['Proof reference', e.proofRef ? <span className="mono" key="p">{e.proofRef}</span> : '—'],
            ['Admission date', fmtDate(e.admissionDate)],
            ['Mode', e.admissionMode],
            ['Semester', e.semester],
            ['Status', <StatusBadge s={e.status} key="st" />],
            e.exitDate && ['Exit', `${fmtDate(e.exitDate)} · ${e.exitReason}`],
            ['Batch', e.batchId ? <Link to={`/app/batches/${e.batchId}`} key="b">{e.batchId.slice(0, 10)}</Link> : '—'],
          ]} />
        </Card>
      </div>
      <div className="grid g2 mt">
        <Card title="Verifiable credentials" actions={(isAdmin || user.role === 'aicte_admin') && (
          <div className="row">
            {e.status === 'active' && e.recordState === 'aicte_verified' && <button className="btn sm sun" onClick={() => issue('Enrolment')}>Issue enrolment credential</button>}
            {e.status === 'graduated' && <button className="btn sm go" onClick={() => issue('Completion')}>Issue completion credential</button>}
          </div>
        )}>
          {e.status === 'active' && e.recordState !== 'aicte_verified' && <p className="small muted">An enrolment credential can be issued once AICTE verifies this record.</p>}
          {creds.length ? creds.map((c) => (
            <div key={c.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)' }}>
              <Badge color={c.revoked ? 'red' : 'green'}>{c.revoked ? 'Revoked' : c.type}</Badge>
              <span className="mono small" style={{ flex: 1 }}>{c.id}</span>
              <span className="small muted">{fmtDate(c.issuedAt)} · DigiLocker {c.digilocker === 'pushed' ? '✓' : '—'}</span>
              {!c.revoked && c.digilocker !== 'pushed' && (isAdmin || user.role === 'aicte_admin') && <button className="btn sm" onClick={() => { pushToDigiLocker(c, user); toast('Pushed to DigiLocker (simulated)', 'good'); }}>Push</button>}
              {!c.revoked && user.role === 'aicte_admin' && <button className="btn sm" onClick={() => setConfirm(c)}>Revoke</button>}
            </div>
          )) : <div className="empty">No credentials issued yet.</div>}
        </Card>
        <Card title="Flags on this student">
          {flags.length ? flags.map((f) => (
            <div key={f.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line-soft)', alignItems: 'flex-start' }}>
              <Badge color={f.severity === 'hold' ? 'red' : 'orange'}>{f.code}</Badge>
              <span className="small" style={{ flex: 1 }}>{f.reason}</span>
              <Badge color="grey">{f.status}</Badge>
            </div>
          )) : <div className="empty">No flags.</div>}
          {others.length > 0 && <Callout kind="warn" title="Other records with this APAAR ID">{others.map((o) => <div key={o.id}><Link to={`/app/students/${o.id}`}>{db.get('institutions', o.institutionId)?.name} · {o.course} · {STATUS[o.status]}</Link></div>)}</Callout>}
        </Card>
      </div>
      <div className="mt">
        <Card title="History">
          {[...ledger.map((l) => ({ at: l.at, what: `Ledger: ${l.action} ${l.slotLabel}`, by: l.by, note: l.note })), ...history.map((h) => ({ at: h.at, what: h.action.replace(/_/g, ' '), by: h.actorName, note: h.detail, hash: h.hash }))]
            .sort((a, b) => b.at.localeCompare(a.at)).map((h, i) => (
              <div key={i} className="row small" style={{ padding: '5px 0', borderBottom: '1px dashed var(--line-soft)' }}>
                <span className="nowrap muted" style={{ width: 130 }}>{fmtDateTime(h.at)}</span>
                <b style={{ width: 200 }}>{h.what}</b>
                <span style={{ flex: 1 }}>{h.note}</span>
                <span className="muted">{h.by}</span>
                {h.hash && <span className="hash" title="Audit hash">{h.hash.slice(0, 10)}…</span>}
              </div>
            ))}
        </Card>
      </div>
      {edit && <EditModal e={e} user={user} onClose={() => setEdit(false)} />}
      {statusModal && <StatusModal e={e} status={statusModal} user={user} onClose={() => setStatusModal(null)} />}
      {confirm && <Confirm title="Revoke credential?" body="Verifiers checking online will see it as revoked. This is logged in the audit trail." confirmLabel="Revoke" onClose={() => setConfirm(null)} onConfirm={() => { revokeCredential(confirm, 'Revoked by AICTE', user); toast('Credential revoked', 'good'); }} />}
    </Page>
  );
}

function EditModal({ e, user, onClose }) {
  const [f, setF] = useState({ name: e.name, dob: e.dob, guardian: e.guardian, email: e.email, phone: decryptField(e.phoneEnc), bank: decryptField(e.bankEnc), proofRef: e.proofRef });
  const [err, setErr] = useState('');
  const save = () => {
    try {
      updateEnrolment(e, f, user);
      toast('Record corrected. It must be re-submitted to AICTE.', 'good');
      onClose();
    } catch (x) {
      setErr(x.message);
    }
  };
  const fld = (k, label, help, type = 'text') => <Field label={label} help={help}><input className="input" type={type} value={f[k] || ''} onChange={(ev) => setF({ ...f, [k]: ev.target.value })} /></Field>;
  return (
    <Modal title="Correct student data" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save correction</button></>}>
      <Callout kind="info">Name and date of birth are re-checked against ABC. The change is logged with before/after hashes, and a verified record goes back to "APAAR-verified" until you re-submit.</Callout>
      {err && <Callout kind="bad">{err}</Callout>}
      <div className="form-grid">
        {fld('name', 'Name', 'As in APAAR')}
        {fld('dob', 'Date of birth', 'YYYY-MM-DD', 'date')}
        {fld('guardian', 'Guardian')}
        {fld('phone', 'Phone', '10-digit mobile')}
        {fld('email', 'Email')}
        {fld('bank', 'Bank account', 'Optional')}
        {fld('proofRef', 'Proof reference', CATEGORIES[e.category].proof || 'Not needed for this category')}
      </div>
    </Modal>
  );
}

function StatusModal({ e, status, user, onClose }) {
  const [reason, setReason] = useState(status === 'graduated' ? 'Programme completed' : '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const label = { dropped: 'Withdraw student', transferred: 'Transfer out', graduated: 'Mark as graduated' }[status];
  return (
    <Modal title={label} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={!reason} onClick={() => { changeStatus(e, status, { reason, date, actor: user }); toast(`${label}: done. Seat ${e.slotLabel} is free again.`, 'good'); onClose(); }}>{label}</button></>}>
      <p>{status === 'graduated' ? 'The student will be able to receive a completion credential and degree certificate.' : `Seat ${e.slotLabel} will be vacated in the ledger and the student will be notified.`}</p>
      <div className="form-grid">
        <Field label="Reason"><input className="input" value={reason} onChange={(ev) => setReason(ev.target.value)} placeholder={status === 'dropped' ? 'e.g. Joined another institution' : 'e.g. Migrated to XYZ College'} /></Field>
        <Field label="Date"><input className="input" type="date" value={date} onChange={(ev) => setDate(ev.target.value)} /></Field>
      </div>
    </Modal>
  );
}
