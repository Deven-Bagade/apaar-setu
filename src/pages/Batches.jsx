import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Page, Card, Table, Badge, Callout, Stat, KV, Confirm, toast } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleBatches, canSeeInstitution } from '../data/scope';
import { VCODES } from '../lib/constants';
import { fmtDate, fmtDateTime, downloadFile } from '../lib/util';
import { decryptField, fingerprint, fromB64url } from '../lib/crypto';
import { submitBatch, verifyBatch, verifyBatchSignature, processUpload, prepareIndex, TEMPLATE_COLUMNS } from '../services/enrolment';
import { BatchStatus } from './Dashboard';
import { StateBadge } from './Students';

export default function Batches() {
  useStore();
  const { user } = useSession();
  const nav = useNavigate();
  const [status, setStatus] = useState('');
  const rows = visibleBatches(user).filter((b) => !status || b.status === status);
  return (
    <Page title="Batches" subtitle="Every upload is a batch. A batch moves Draft → Submitted (signed by the college) → AICTE-verified." guide="batches">
      <Table rows={rows} onRowClick={(b) => nav(`/app/batches/${b.id}`)} search="Search file or institution…" searchKeys={['fileName', (b) => db.get('institutions', b.institutionId)?.name]}
        toolbar={<select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="submitted">Submitted</option><option value="verified">AICTE-verified</option></select>}
        columns={[
          { key: 'at', label: 'Uploaded', render: (b) => fmtDate(b.at), sort: (b) => b.at },
          { key: 'inst', label: 'Institution', render: (b) => db.get('institutions', b.institutionId)?.short },
          { key: 'fileName', label: 'Source', render: (b) => <>{b.fileName || b.source}<div className="tiny muted">{b.source} · by {b.by}</div></> },
          { key: 'accepted', label: 'Accepted', num: true },
          { key: 'held', label: 'On hold', num: true, render: (b) => b.held ? <Badge color="orange">{b.held}</Badge> : 0 },
          { key: 'rejected', label: 'Rejected', num: true, render: (b) => b.rejected ? <Badge color="red">{b.rejected}</Badge> : 0 },
          { key: 'status', label: 'Status', render: (b) => <BatchStatus b={b} /> },
        ]} />
    </Page>
  );
}

export function BatchDetail() {
  useStore();
  const { id } = useParams();
  const { user } = useSession();
  const nav = useNavigate();
  const b = db.get('batches', id);
  const [confirm, setConfirm] = useState(null);
  const [edits, setEdits] = useState({});
  if (!b || !canSeeInstitution(user, b.institutionId)) return <Callout kind="bad" title="Not found">This batch is not in your scope.</Callout>;
  const inst = db.get('institutions', b.institutionId);
  const ens = db.where('enrolments', (e) => b.enrolmentIds.includes(e.id));
  const sig = b.signature ? verifyBatchSignature(b) : null;
  const canSubmit = user.role === 'institution_admin' && b.status === 'draft' && ens.some((e) => e.recordState === 'apaar_verified');
  const canVerify = ['aicte_admin', 'regional_officer'].includes(user.role) && b.status === 'submitted';
  const canFix = ['institution_admin', 'data_clerk'].includes(user.role);
  const rej = b.rejectedRows || [];
  const fields = ['apaar_id', 'student_name', 'dob', 'nationality', 'programme_code', 'category', 'proof_ref', 'institution_student_id'];

  const recheck = async () => {
    const fixed = rej.filter((r) => edits[r.rowNo]).map((r) => ({ ...r.row, phone: decryptField(r.row.phone), bank_account: decryptField(r.row.bank_account), ...edits[r.rowNo], __row: r.rowNo, __fixOf: r.rowNo }));
    if (!fixed.length) return toast('Edit at least one rejected row first', 'bad');
    await prepareIndex(fixed.map((r) => r.apaar_id));
    const res = processUpload(fixed, { institution: inst, actor: user, source: b.source, batchId: b.id });
    setEdits({});
    toast(`Re-checked ${fixed.length} row(s): ${res.accepted.length} accepted, ${res.rejected.length} still rejected`, res.rejected.length ? 'bad' : 'good');
  };
  const exportFix = () => {
    const wb = XLSX.utils.book_new();
    const rows = rej.map((r) => ({ row: r.rowNo, ...Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c, c === 'phone' || c === 'bank_account' ? decryptField(r.row[c]) : r.row[c]])), problem: r.issues.map((i) => `${i.code}: ${i.msg}`).join(' | ') }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'fix_list');
    downloadFile(`fix_list_${b.id.slice(0, 8)}.xlsx`, new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]));
  };

  return (
    <Page kicker={inst.name} title={`Batch ${b.id.slice(0, 10)}`} subtitle={`${b.fileName || b.source} · uploaded ${fmtDateTime(b.at)} by ${b.by}`}
      actions={<>
        <button className="btn" onClick={() => nav('/app/batches')}>← All batches</button>
        {canSubmit && <button className="btn primary" onClick={() => setConfirm('submit')}>✍ Sign &amp; submit to AICTE</button>}
        {user.role === 'data_clerk' && b.status === 'draft' && <Badge color="yellow">Your Institution Admin submits this batch</Badge>}
        {canVerify && <button className="btn go" onClick={() => setConfirm('verify')}>✓ Verify signature &amp; approve</button>}
      </>}>
      <div className="stepper mb">
        <div className="step done">Uploaded<small>{fmtDate(b.at)}</small></div>
        <div className={`step ${b.status === 'draft' ? 'now' : 'done'}`}>Signed &amp; submitted<small>{b.submittedAt ? fmtDate(b.submittedAt) + ' · ' + b.submittedBy : 'waiting for Institution Admin'}</small></div>
        <div className={`step ${b.status === 'verified' ? 'done' : b.status === 'submitted' ? 'now' : ''}`}>AICTE-verified<small>{b.verifiedAt ? fmtDate(b.verifiedAt) + ' · ' + b.verifiedBy : 'pending'}</small></div>
      </div>
      <div className="grid g4">
        <Stat label="Rows in file" value={b.total} color="yellow" />
        <Stat label="Accepted" value={b.accepted} color="green" />
        <Stat label="On hold" value={ens.filter((e) => e.recordState === 'on_hold').length} color="orange" />
        <Stat label="Rejected" value={rej.length} color="red" />
      </div>
      {sig && (
        <Card title="Digital signature" className="mt" accent={sig.ok ? 'green' : 'red'}>
          <KV items={[
            ['Result', sig.ok ? <Badge color="green" key="r">Valid · signed by {inst.short}</Badge> : <Badge color="red" key="r">Invalid</Badge>],
            ['Signer key fingerprint', <span className="mono" key="f">{fingerprint(fromB64url(b.signerKey))}</span>],
            ['Payload hash (SHA-512/256)', <span className="hash" key="h">{b.payloadHash}</span>],
            ['Signature (Ed25519)', <span className="hash" key="s">{b.signature.slice(0, 64)}…</span>],
          ]} />
        </Card>
      )}
      {rej.length > 0 && (
        <Card title={`Rejected rows (${rej.length})`} className="mt" accent="red" sub={canFix ? 'Edit the red cells, then click Re-check. Fixed rows move into the accepted list.' : 'The institution must correct these rows.'}
          actions={<><button className="btn sm" onClick={exportFix}>⬇ Fix list (Excel)</button>{canFix && <button className="btn sm primary" onClick={recheck}>Re-check fixed rows</button>}</>}>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Row</th>{fields.map((f) => <th key={f}>{f}</th>)}<th>Problem</th></tr></thead>
              <tbody>
                {rej.map((r) => (
                  <tr key={r.rowNo}>
                    <td className="num">{r.rowNo}</td>
                    {fields.map((f) => {
                      const bad = r.issues.some((i) => i.field === f || (i.code === 'V02' && ['student_name', 'dob', 'apaar_id'].includes(f) && i.field === f));
                      const val = edits[r.rowNo]?.[f] ?? r.row[f] ?? '';
                      return (
                        <td key={f} className={bad ? 'bad-cell' : ''}>
                          {canFix ? <input className="input" style={{ padding: '3px 6px', minWidth: f === 'student_name' ? 150 : 100, fontSize: 12.5 }} value={val} onChange={(e) => setEdits({ ...edits, [r.rowNo]: { ...(edits[r.rowNo] || {}), [f]: e.target.value } })} aria-label={`${f} row ${r.rowNo}`} /> : <span className="small">{val}</span>}
                        </td>
                      );
                    })}
                    <td style={{ minWidth: 260 }}>{r.issues.map((i, k) => <div key={k} className="small"><Badge color="red">{i.code}</Badge> {i.msg}</div>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card title={`Accepted records (${ens.length})`} className="mt">
        <Table rows={ens} pageSize={10} onRowClick={(e) => nav(`/app/students/${e.id}`)} search="Search…" searchKeys={['name', 'apaarId', 'instStudentId']} columns={[
          { key: 'name', label: 'Student', render: (e) => <><b>{e.name}</b><div className="mono tiny muted">{e.apaarId}</div></> },
          { key: 'programmeCode', label: 'Programme' },
          { key: 'category', label: 'Category' },
          { key: 'slotLabel', label: 'Seat', render: (e) => <span className="mono">{e.slotLabel}</span> },
          { key: 'nameScore', label: 'ABC match', num: true, render: (e) => Math.round(e.nameScore * 100) + '%' },
          { key: 'recordState', label: 'Record state', render: (e) => <StateBadge s={e.recordState} /> },
        ]} />
      </Card>
      {confirm === 'submit' && (
        <Confirm title="Sign and submit this batch?" confirmLabel="Sign & submit" onClose={() => setConfirm(null)}
          onConfirm={() => { const n = submitBatch(b.id, user); toast(`Signed and submitted ${n} record(s) to AICTE`, 'good'); }}
          body={<><p>The records will be signed with <b>{inst.name}</b>&apos;s key (fingerprint <span className="mono">{inst.keyFingerprint}</span>). AICTE can then prove exactly what your college submitted.</p>{ens.some((e) => e.recordState === 'on_hold') && <Callout kind="warn">Records on hold stay out of the submission until AICTE resolves them.</Callout>}{rej.length > 0 && <Callout kind="warn">{rej.length} rejected row(s) are not included. You can fix and submit them later.</Callout>}</>} />
      )}
      {confirm === 'verify' && (
        <Confirm title="Verify and approve this batch?" confirmLabel="Approve" kind="go" onClose={() => setConfirm(null)}
          onConfirm={() => { try { const n = verifyBatch(b.id, user); toast(`${n} record(s) are now AICTE-verified`, 'good'); } catch (e) { toast(e.message, 'bad'); } }}
          body={<p>The signature is {sig?.ok ? <b style={{ color: 'var(--green)' }}>valid</b> : <b style={{ color: 'var(--red)' }}>INVALID</b>}. Approving marks {ens.filter((e) => e.recordState === 'ledger_accepted').length} record(s) as AICTE-verified and notifies the students.</p>} />
      )}
      <p className="small muted mt">Codes: {Object.entries(VCODES).slice(0, 5).map(([k, v]) => `${k} ${v.title}`).join(' · ')} · <Link to="/help#codes">all codes</Link></p>
    </Page>
  );
}
