import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Card, Badge, Callout, toast, KV } from '../../components/ui';
import { QRImage } from '../../components/QR';
import { useSession } from '../../data/session';
import { useStore, db } from '../../data/store';
import { CLAIM_LABELS, presentation, presentationUrl, toW3C, issueCredential } from '../../services/credentials';
import { downloadFile, fmtDate } from '../../lib/util';

const DEFAULT = ['name', 'programme', 'institution', 'status'];

export default function Credentials() {
  useStore();
  const { user } = useSession();
  const creds = db.where('credentials', (c) => c.apaarId === user.apaarId).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const eligible = db.where('enrolments', (e) => e.apaarId === user.apaarId && ((e.status === 'active' && e.recordState === 'aicte_verified') || e.status === 'graduated'))
    .filter((e) => !creds.some((c) => c.enrolmentId === e.id && !c.revoked));
  const [sel, setSel] = useState(creds[0]?.id);
  const [fields, setFields] = useState(DEFAULT);
  const cred = creds.find((c) => c.id === sel) || creds[0];
  const pres = cred && !cred.revoked ? presentation(cred, fields) : '';
  const url = pres ? presentationUrl(pres) : '';
  return (
    <Page title="My credentials" subtitle="Signed by AICTE. You decide which details each QR or link reveals." guide="credentials">
      {eligible.map((e) => (
        <Callout key={e.id} kind="good" title={`Your ${e.course} admission is AICTE-verified`}>
          You can get your {e.status === 'graduated' ? 'completion' : 'enrolment'} credential now.{' '}
          <button className="btn sm go" onClick={() => { const c = issueCredential(e, e.status === 'graduated' ? 'Completion' : 'Enrolment', { id: user.id, name: 'AICTE (self-service)', role: 'system' }); setSel(c.id); toast('Credential issued', 'good'); }}>Get my credential</button>
        </Callout>
      ))}
      {!cred && !eligible.length && <Callout kind="info">No credential yet. It becomes available once AICTE verifies your admission.</Callout>}
      {cred && (
        <div className="grid g3">
          <Card title="Credential">
            {creds.length > 1 && <select className="input mb" value={cred.id} onChange={(e) => setSel(e.target.value)}>{creds.map((c) => <option key={c.id} value={c.id}>{c.type} · {fmtDate(c.issuedAt)}</option>)}</select>}
            <KV items={[
              ['Type', <Badge color={cred.revoked ? 'red' : 'green'} key="t">{cred.revoked ? 'Revoked' : cred.type}</Badge>],
              ['Issued', fmtDate(cred.issuedAt)],
              ['Issuer', 'AICTE'],
              ['ID', <span className="mono small" key="i">{cred.id}</span>],
              ['DigiLocker', cred.digilocker === 'pushed' ? <Badge color="green" key="d">In Issued Documents</Badge> : 'Not pushed'],
            ]} />
            <button className="btn sm mt" onClick={() => downloadFile(`credential_${cred.id}.json`, JSON.stringify(toW3C(cred), null, 2), 'application/json')}>⬇ W3C credential (JSON)</button>
          </Card>
          <Card title="Choose what to share">
            {Object.keys(cred.disclosures).map((k) => (
              <label key={k} className="check" style={{ display: 'flex', padding: '4px 0', borderBottom: '1px dashed var(--line-soft)' }}>
                <input type="checkbox" checked={fields.includes(k)} onChange={() => setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]))} />
                <span style={{ flex: 1 }}>{CLAIM_LABELS[k]}</span>
                <span className="small muted">{String(cred.disclosures[k][1])}</span>
              </label>
            ))}
            <p className="tiny muted mt-s">Unticked details stay hidden. The verifier still sees that they exist and that the shared ones are genuine.</p>
          </Card>
          <Card title="Your QR" accent="green">
            {cred.revoked ? <Callout kind="bad">This credential was revoked.</Callout> : fields.length === 0 ? <div className="empty">Tick at least one detail.</div> : (
              <>
                <QRImage text={url} size={230} />
                <div className="row mt-s">
                  <button className="btn sm sun" onClick={() => { navigator.clipboard?.writeText(url); toast('Link copied', 'good'); }}>Copy link</button>
                  <Link className="btn sm" to={`/verify#${pres}`}>Test it</Link>
                </div>
                <p className="tiny muted mt-s">Shares: {fields.map((f) => CLAIM_LABELS[f]).join(', ')}</p>
              </>
            )}
          </Card>
        </div>
      )}
    </Page>
  );
}
