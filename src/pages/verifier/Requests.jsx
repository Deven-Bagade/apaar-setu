import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page, Card, Table, Badge, Field, Modal, KV, Callout, toast } from '../../components/ui';
import { useSession } from '../../data/session';
import { useStore, db } from '../../data/store';
import { CONSENT_FIELDS } from '../../lib/constants';
import { requestConsent, effectiveStatus, openSharedRecord } from '../../services/consent';
import { fmtDate, fmtDateTime } from '../../lib/util';

const C = { pending: 'yellow', granted: 'green', denied: 'red', revoked: 'grey', expired: 'grey' };

export default function Requests() {
  useStore();
  const { user } = useSession();
  const [sp] = useSearchParams();
  const [f, setF] = useState({ apaarId: sp.get('apaar') || '', purpose: '', fields: ['name', 'programme', 'institution', 'status'], days: 15 });
  const [err, setErr] = useState('');
  const [view, setView] = useState(null);
  const mine = db.where('consents', (c) => c.requesterId === user.id).map((c) => ({ ...c, eff: effectiveStatus(c) })).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const send = (e) => {
    e.preventDefault();
    setErr('');
    try {
      requestConsent(f, user);
      toast('Request sent. The student has been notified.', 'good');
      setF({ ...f, apaarId: '', purpose: '' });
    } catch (x) {
      setErr(x.message);
    }
  };
  const open = (c) => {
    try {
      setView({ c, data: openSharedRecord(c, user) });
    } catch (x) {
      toast(x.message, 'bad');
    }
  };
  return (
    <Page kicker={user.org} title="Access requests" subtitle="Ask a student for permission to see specific details. Purpose-bound, time-limited and logged." guide="requests">
      <div className="grid g3">
        <form className="card" onSubmit={send}>
          <h3>New request</h3>
          {err && <Callout kind="bad">{err}</Callout>}
          <div className="col">
            <Field label="Student’s APAAR ID" help="12 digits; the student gives it to you"><input className="input mono" value={f.apaarId} maxLength={12} onChange={(e) => setF({ ...f, apaarId: e.target.value.replace(/\D/g, '') })} /></Field>
            <Field label="Purpose" help="The student sees this exactly"><textarea className="input" style={{ fontFamily: 'var(--font)', minHeight: 60 }} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Verifying enrolment for an internship offer" /></Field>
            <Field label="Fields you need">
              <div className="col" style={{ gap: 2 }}>
                {Object.entries(CONSENT_FIELDS).map(([k, l]) => <label key={k} className="check"><input type="checkbox" checked={f.fields.includes(k)} onChange={() => setF({ ...f, fields: f.fields.includes(k) ? f.fields.filter((x) => x !== k) : [...f.fields, k] })} />{l}</label>)}
              </div>
            </Field>
            <Field label="Access for (days)"><input className="input" type="number" min={1} max={90} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value })} /></Field>
            <button className="btn primary">Send request</button>
          </div>
          <p className="tiny muted mt-s">Ask only for what you need (data minimisation, DPDP Act 2023).</p>
        </form>
        <Card title="My requests" className="span2">
          <Table rows={mine} columns={[
            { key: 'apaarId', label: 'APAAR', render: (c) => <span className="mono">{c.apaarId.slice(0, 4)}••••{c.apaarId.slice(-4)}</span> },
            { key: 'purpose', label: 'Purpose', render: (c) => <span className="small">{c.purpose}</span> },
            { key: 'eff', label: 'Status', render: (c) => <Badge color={C[c.eff]}>{c.eff}</Badge> },
            { key: 'requestedAt', label: 'Asked', render: (c) => fmtDate(c.requestedAt) },
            { key: 'expiresAt', label: 'Expires', render: (c) => (c.expiresAt ? fmtDate(c.expiresAt) : '—') },
            { key: 'act', label: '', nosort: true, render: (c) => c.eff === 'granted' && <button className="btn sm go" onClick={() => open(c)}>Open record</button> },
          ]} />
        </Card>
      </div>
      {view && (
        <Modal title="Shared record" onClose={() => setView(null)}>
          <Callout kind="info">Shared by the student for: “{view.c.purpose}”. This view was logged at {fmtDateTime(new Date().toISOString())} and is visible to the student.</Callout>
          <KV items={Object.entries(view.data || {}).map(([k, v]) => [CONSENT_FIELDS[k] || k, String(v)])} />
          {view.c.grantedFields?.length < view.c.fields.length && <p className="small muted mt">The student chose not to share: {view.c.fields.filter((x) => !view.c.grantedFields.includes(x)).map((x) => CONSENT_FIELDS[x]).join(', ')}.</p>}
        </Modal>
      )}
    </Page>
  );
}
