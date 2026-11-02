import { useState } from 'react';
import { Page, Card, Table, Badge, Callout, toast } from '../components/ui';
import { QRImage } from '../components/QR';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { issueCredential, presentation, presentationUrl } from '../services/credentials';
import { fmtDate } from '../lib/util';
import { audit } from '../services/audit';

const CERT_FIELDS = ['name', 'apaarId', 'studentId', 'institution', 'programme', 'status', 'completedOn', 'admissionYear'];

export default function Certificates() {
  useStore();
  const { user } = useSession();
  const inst = db.get('institutions', user.institutionId);
  const [kind, setKind] = useState('graduated');
  const [sel, setSel] = useState(null);
  const list = db.where('enrolments', (e) => e.institutionId === inst.id && (kind === 'graduated' ? e.status === 'graduated' : e.status === 'active' && e.recordState === 'aicte_verified'));
  const e = sel && db.get('enrolments', sel);
  const type = e?.status === 'graduated' ? 'Completion' : 'Enrolment';
  const cred = e && db.where('credentials', (c) => c.enrolmentId === e.id && c.type === type && !c.revoked).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0];
  const pres = cred && presentation(cred, CERT_FIELDS.filter((f) => cred.disclosures[f]));
  return (
    <Page kicker={inst.name} title="Certificates" subtitle="Print certificates that carry the APAAR ID, your student ID and an AICTE-signed QR anyone can verify." guide="certificates">
      <div className="grid g3">
        <Card title="1. Choose a student" className="no-print">
          <div className="row mb">
            <button className={`btn sm ${kind === 'graduated' ? 'sun' : ''}`} onClick={() => { setKind('graduated'); setSel(null); }}>Degree (graduated)</button>
            <button className={`btn sm ${kind === 'active' ? 'sun' : ''}`} onClick={() => { setKind('active'); setSel(null); }}>Bonafide (current)</button>
          </div>
          <Table rows={list} pageSize={8} search="Search name or APAAR…" searchKeys={['name', 'apaarId', 'instStudentId']} onRowClick={(r) => setSel(r.id)} rowClass={(r) => (r.id === sel ? 'sel' : '')}
            empty={kind === 'graduated' ? 'No graduated students yet. Mark students as graduated from their record.' : 'No AICTE-verified current students.'}
            columns={[
              { key: 'name', label: 'Student', render: (r) => <><b>{r.name}</b><div className="tiny muted">{r.programmeCode} · {r.instStudentId}</div></> },
              { key: 'c', label: 'Cred.', nosort: true, render: (r) => db.find('credentials', (c) => c.enrolmentId === r.id && !c.revoked) ? <Badge color="green">✓</Badge> : '' },
            ]} />
        </Card>
        <div className="span2">
          {!e && <Card><div className="empty">Pick a student on the left to preview the certificate.</div></Card>}
          {e && !cred && (
            <Card title="2. Issue the credential first" accent="yellow">
              <p>The QR on the certificate is a signed {type.toLowerCase()} credential. Issue it now; the student also receives it in their APAAR-Setu account.</p>
              <button className="btn primary" onClick={() => { issueCredential(e, type, user); toast('Credential issued', 'good'); }}>Issue {type} credential</button>
            </Card>
          )}
          {e && cred && (
            <>
              <div className="row mb no-print">
                <button className="btn primary" onClick={() => { audit(user, 'CERTIFICATE_PRINT', 'enrolment:' + e.id, { detail: cred.id }); window.print(); }}>⎙ Print certificate</button>
                <span className="small muted">Use “Save as PDF” in the print dialog for a digital copy.</span>
              </div>
              <div className="cert">
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <div className="small">AICTE ID: <b>{inst.aicteId}</b></div>
                  <div className="small">Sl. No. {cred.id.slice(2, 10).toUpperCase()}</div>
                </div>
                <div className="inst mt">{inst.name}</div>
                <div className="center small">{inst.city}, {inst.state} · Approved by the All India Council for Technical Education</div>
                <h1>{type === 'Completion' ? 'Degree Certificate' : 'Bonafide Certificate'}</h1>
                <div className="body">
                  {type === 'Completion' ? <>This is to certify that <b>{e.name}</b> has completed the programme <b>{e.course}</b> (admitted {e.academicYear}) and has been awarded the same on <b>{fmtDate(e.exitDate)}</b>.</>
                    : <>This is to certify that <b>{e.name}</b> is a bonafide student of <b>{e.course}</b>, semester {e.semester}, admitted in the academic year {e.academicYear}-{String(e.academicYear + 1).slice(2)}.</>}
                </div>
                <div className="ids">
                  <div>
                    <div>APAAR ID: <span className="mono strong">{e.apaarId.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3')}</span></div>
                    <div>Student ID: <span className="mono strong">{e.instStudentId}</span></div>
                    <div className="tiny mt-s">Scan the QR to verify at {window.location.host}/verify — works offline.</div>
                  </div>
                  <div className="seal">AICTE<br />VERIFIED<br />SEAT {e.slotLabel}</div>
                  <div className="center">
                    <QRImage text={presentationUrl(pres)} size={150} />
                    <div className="tiny">Signed credential {cred.id}</div>
                  </div>
                </div>
                <div className="row between mt" style={{ marginTop: 34 }}>
                  <div className="center small" style={{ borderTop: '1px solid #2a1d15', paddingTop: 4, width: 180 }}>Controller of Examinations</div>
                  <div className="center small" style={{ borderTop: '1px solid #2a1d15', paddingTop: 4, width: 180 }}>Principal / Director</div>
                </div>
              </div>
              <Callout kind="info" title="For other degree-awarding bodies (universities, boards)">
                The same block can be printed by any certificate system: call <span className="mono">GET /api/v1/credentials/{'{apaarId}'}/qr</span> and place the returned QR with the APAAR ID and student ID. See API sandbox.
              </Callout>
            </>
          )}
        </div>
      </div>
    </Page>
  );
}
