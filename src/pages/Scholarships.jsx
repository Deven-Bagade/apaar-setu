import { useState } from 'react';
import { Page, Table, Badge, Stat, toast, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { visibleInstitutions } from '../data/scope';
import { claimStatus, setPayment, SCHEMES } from '../services/scholarship';
import { runRadar } from '../services/radar';
import { fmtDate } from '../lib/util';

const C = { ok: 'green', no_seat: 'red', withdrawn: 'red', duplicate: 'orange', on_hold: 'orange' };

export default function Scholarships() {
  useStore();
  const { user } = useSession();
  const [f, setF] = useState('problems');
  const ids = new Set(visibleInstitutions(user).map((i) => i.id));
  const all = db.where('scholarships', (c) => ids.has(c.institutionId)).map((c) => ({ ...c, chk: claimStatus(c) }));
  const bad = all.filter((c) => c.chk.status !== 'ok');
  const rows = f === 'problems' ? bad : f === 'ok' ? all.filter((c) => c.chk.status === 'ok') : all;
  const amt = (l) => '₹' + l.reduce((s, c) => s + c.amount, 0).toLocaleString('en-IN');
  return (
    <Page title="Scholarships" subtitle="Scholarship and fee-reimbursement claims matched against real, occupied seats before money is released." guide="scholarships"
      actions={user.role === 'aicte_admin' && <button className="btn" onClick={() => { runRadar(user); toast('Cross-check re-run; V12 flags refreshed', 'good'); }}>↻ Re-run cross-check</button>}>
      <Callout kind="info">Claims come from a mock National Scholarship Portal feed with the same fields NSP exports. In production this is a nightly API pull.</Callout>
      <div className="grid g4">
        <Stat label="Claims" value={all.length} hint={amt(all)} color="yellow" />
        <Stat label="Matched to a seat" value={all.length - bad.length} color="green" />
        <Stat label="Fail the seat check" value={bad.length} hint={amt(bad) + ' at risk'} color="red" />
        <Stat label="Payments withheld" value={all.filter((c) => c.paymentStatus === 'withheld').length} color="orange" />
      </div>
      <div className="mt">
        <Table rows={rows} search="Search name, APAAR or institution…" searchKeys={['name', 'apaarId', (c) => db.get('institutions', c.institutionId)?.name]}
          toolbar={<select className="input" value={f} onChange={(e) => setF(e.target.value)} aria-label="Filter"><option value="problems">Only problems</option><option value="ok">Only matched</option><option value="all">All claims</option></select>}
          columns={[
            { key: 'name', label: 'Claimant', render: (c) => <><b>{c.name}</b><div className="mono tiny muted">{c.apaarId}</div></> },
            { key: 'scheme', label: 'Scheme', render: (c) => SCHEMES[c.scheme]?.label },
            { key: 'amount', label: 'Amount', num: true, render: (c) => '₹' + c.amount.toLocaleString('en-IN') },
            { key: 'inst', label: 'Institution', render: (c) => db.get('institutions', c.institutionId)?.short },
            { key: 'claimDate', label: 'Claimed', render: (c) => fmtDate(c.claimDate) },
            { key: 'chk', label: 'Seat check', render: (c) => <><Badge color={C[c.chk.status]}>{c.chk.label}</Badge><div className="tiny muted">{c.chk.why}</div></>, sort: (c) => c.chk.status },
            { key: 'paymentStatus', label: 'Payment', render: (c) => (
              <div className="row" style={{ gap: 4 }}>
                <Badge color={{ pending: 'yellow', withheld: 'red', released: 'green' }[c.paymentStatus]}>{c.paymentStatus}</Badge>
                {c.paymentStatus !== 'withheld' && c.chk.status !== 'ok' && <button className="btn sm" onClick={() => { setPayment(c, 'withheld', user); toast('Payment withheld', 'good'); }}>Withhold</button>}
                {c.paymentStatus !== 'released' && <button className="btn sm" onClick={() => { setPayment(c, 'released', user); toast('Payment released', 'good'); }}>Release</button>}
              </div>
            ) },
          ]} />
      </div>
    </Page>
  );
}
