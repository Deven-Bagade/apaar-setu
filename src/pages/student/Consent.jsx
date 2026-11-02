import { useState } from 'react';
import { Page, Card, Badge, Callout, toast, Table } from '../../components/ui';
import { useSession } from '../../data/session';
import { useStore, db } from '../../data/store';
import { CONSENT_FIELDS } from '../../lib/constants';
import { decide, effectiveStatus } from '../../services/consent';
import { fmtDate, fmtDateTime } from '../../lib/util';

const C = { pending: 'yellow', granted: 'green', denied: 'red', revoked: 'grey', expired: 'grey' };

function Request({ c, user }) {
  const [fields, setFields] = useState(c.fields);
  return (
    <Card className="mb" accent="orange" title={c.requesterOrg} sub={`${c.orgType} · asked ${fmtDateTime(c.requestedAt)} by ${c.requesterName}`}>
      <p><b>Purpose:</b> {c.purpose}</p>
      <p className="small">Wants to see, for <b>{c.days} days</b>:</p>
      <div className="row mb">
        {c.fields.map((f) => (
          <label key={f} className="check" style={{ border: '1.5px solid var(--ink)', padding: '3px 8px', background: fields.includes(f) ? 'var(--yellow-soft)' : 'var(--paper)' }}>
            <input type="checkbox" checked={fields.includes(f)} onChange={() => setFields((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]))} />{CONSENT_FIELDS[f]}
          </label>
        ))}
      </div>
      <div className="row">
        <button className="btn go" disabled={!fields.length} onClick={() => { decide(c, 'grant', user, fields); toast('Access allowed', 'good'); }}>Allow {fields.length < c.fields.length ? `${fields.length} of ${c.fields.length} fields` : ''}</button>
        <button className="btn" onClick={() => { decide(c, 'deny', user); toast('Request denied', 'good'); }}>Deny</button>
      </div>
    </Card>
  );
}

export default function ConsentPage() {
  useStore();
  const { user } = useSession();
  const all = db.where('consents', (c) => c.apaarId === user.apaarId).map((c) => ({ ...c, eff: effectiveStatus(c) })).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const pending = all.filter((c) => c.eff === 'pending');
  const active = all.filter((c) => c.eff === 'granted');
  return (
    <Page title="Consent" subtitle="Nobody outside your college and the regulator sees your data unless you allow it here." guide="consent">
      <h2>Waiting for you ({pending.length})</h2>
      {pending.length ? pending.map((c) => <Request key={c.id} c={c} user={user} />) : <Callout kind="good">No pending requests.</Callout>}
      <h2 className="mt">Active access ({active.length})</h2>
      {active.length ? active.map((c) => (
        <Card key={c.id} className="mb" title={c.requesterOrg} sub={`${c.purpose}`} actions={<button className="btn warn" onClick={() => { decide(c, 'revoke', user); toast('Access revoked', 'good'); }}>Revoke now</button>}>
          <div className="small">Sees: <b>{(c.grantedFields || []).map((f) => CONSENT_FIELDS[f]).join(', ')}</b> · until {fmtDate(c.expiresAt)}</div>
        </Card>
      )) : <div className="empty">Nobody currently has access.</div>}
      <h2 className="mt">History</h2>
      <Table rows={all} columns={[
        { key: 'requesterOrg', label: 'Organisation' },
        { key: 'purpose', label: 'Purpose', render: (c) => <span className="small">{c.purpose}</span> },
        { key: 'fields', label: 'Fields', render: (c) => <span className="small">{(c.grantedFields || c.fields).map((f) => CONSENT_FIELDS[f]).join(', ')}</span> },
        { key: 'eff', label: 'Status', render: (c) => <Badge color={C[c.eff]}>{c.eff}</Badge> },
        { key: 'requestedAt', label: 'Asked', render: (c) => fmtDate(c.requestedAt) },
      ]} />
    </Page>
  );
}
