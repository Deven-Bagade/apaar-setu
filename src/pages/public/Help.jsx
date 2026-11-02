import { Link } from 'react-router-dom';
import { Page, Card, Badge, Table } from '../../components/ui';
import { ROLES, VCODES, CATEGORIES, PERMS, RECORD_STATES } from '../../lib/constants';
import { useSession } from '../../data/session';

const ROLE_GUIDE = {
  aicte_admin: ['Dashboard: national picture, India map, inspect-first list.', 'Radar: run the cross-college scan, read each flag’s reason.', 'Batches: verify signed batches from colleges.', 'Scholarships: withhold payments for claims without a seat.', 'Audit trail: verify the hash chain; Rules: change caps; Users: add people.'],
  regional_officer: ['Dashboard and Institutions show only your region’s states.', 'Review and resolve flags for your colleges.', 'Verify submitted batches and plan inspections with the Trust Score.'],
  institution_admin: ['Upload students (Excel / form / API) or let your Data Clerk do it.', 'Open each Draft batch, fix rejected rows, then Sign & submit to AICTE.', 'Answer flags, record withdrawals and graduation on the student page.', 'Print certificates with APAAR ID + signed QR; export NBA / NAAC / NIRF reports.'],
  data_clerk: ['Download the Excel template from Upload and fill one row per student.', 'Drop the file in; fix the rows marked in red before sending.', 'After upload, fix rejected rows inside the batch. Your Institution Admin submits.'],
  student: ['My record: see your admission as AICTE sees it.', 'My credentials: tick what to share, show the QR or send the link.', 'Consent: allow or deny employer requests, revoke any time.', 'Who viewed my data: every access with purpose.'],
  verifier: ['Verify a credential: scan the QR on a certificate, works offline.', 'Access requests: ask a student for consent to see specific fields.', 'Open a granted record from your list; access is logged and expires.'],
};

const FAQ = [
  ['Do I need internet to verify a certificate?', 'No. The QR carries the data and AICTE’s signature; the browser checks it with AICTE’s public key. Revocation status is checked only when online.'],
  ['What happens if a college admits more students than approved?', 'The Seat Ledger rejects the upload with code V03 and records a “blocked” event that AICTE can see. To admit beyond intake the student must qualify for a supernumerary scheme with proof.'],
  ['Is Aadhaar stored?', 'No. Only the APAAR ID. Phone and bank numbers are encrypted at field level and matched only through salted hashes.'],
  ['How are duplicates across colleges found?', 'A cross-institution APAAR index (no personal data) is checked at upload. The nightly Radar also finds look-alike identities with different APAAR IDs and contacts shared by many students.'],
  ['Can a college change data after AICTE verifies it?', 'Yes, through a correction, which sends the record back to APAAR-verified for re-submission and is logged with before/after hashes in the audit chain.'],
  ['Which data does the public see?', 'Only the Transparency page: aggregates per college with small counts suppressed.'],
  ['Does this replace DigiLocker, ABC or NAD?', 'No. APAAR-Setu uses APAAR as the identity, pushes credentials into DigiLocker and adds the regulatory layer AICTE needs: seats, categories, anomalies and verification.'],
];

export default function Help() {
  const { user } = useSession();
  const perms = Object.entries(PERMS);
  return (
    <Page kicker="User guide" title="Help" subtitle="Everything you need to use APAAR-Setu. You can also ask Setu Sahayak (bottom-right) any question in plain language.">
      {user && (
        <Card title={`Your role: ${ROLES[user.role].label}`} accent="yellow" className="mb">
          <div className="pill-steps">{ROLE_GUIDE[user.role].map((s) => <div key={s}>{s}</div>)}</div>
        </Card>
      )}
      <div className="grid g2">
        <Card title="Roles and what they do">
          {Object.entries(ROLES).map(([k, r]) => (
            <div key={k} className="mb">
              <Badge color={r.color}>{r.label}</Badge>
              <p className="small mt-s" style={{ margin: '4px 0' }}>{r.desc}</p>
              <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{ROLE_GUIDE[k].map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          ))}
        </Card>
        <div className="col" style={{ gap: 16 }}>
          <Card title="Frequently asked questions">
            {FAQ.map(([q, a]) => (
              <details key={q} className="mb">
                <summary className="strong" style={{ cursor: 'pointer' }}>{q}</summary>
                <p className="small mt-s">{a}</p>
              </details>
            ))}
          </Card>
          <Card title="Record states">
            <div className="stepper">
              {['pre_validated', 'apaar_verified', 'ledger_accepted', 'aicte_verified'].map((s) => <div key={s} className="step">{RECORD_STATES[s].label}</div>)}
            </div>
            <p className="small mt-s">A record that matches an active admission elsewhere is <b>On hold</b> until AICTE resolves it.</p>
          </Card>
          <Card title="Admission categories">
            <Table pageSize={20} rows={Object.entries(CATEGORIES).map(([k, c]) => ({ id: k, code: k, ...c }))} columns={[
              { key: 'code', label: 'Code', render: (r) => <span className="mono strong">{r.code}</span> },
              { key: 'label', label: 'Category' },
              { key: 'desc', label: 'Seat pool' },
              { key: 'proof', label: 'Proof needed', render: (r) => r.proof || '—' },
            ]} />
          </Card>
        </div>
      </div>
      <div id="codes" className="mt">
        <Card title="Validation codes (V01–V15)">
          <Table pageSize={20} rows={Object.entries(VCODES).map(([k, v]) => ({ id: k, code: k, ...v }))} columns={[
            { key: 'code', label: 'Code', render: (r) => <span className="mono strong">{r.code}</span> },
            { key: 'title', label: 'Meaning' },
            { key: 'severity', label: 'Severity', render: (r) => <Badge color={r.severity === 'block' ? 'red' : r.severity === 'hold' ? 'orange' : 'yellow'}>{r.severity}</Badge> },
            { key: 'layer', label: 'Layer', render: (r) => ['', '1 · instant rules', '2 · APAAR + ledger', '3 · intelligence'][r.layer] },
          ]} />
        </Card>
      </div>
      <div className="mt">
        <Card title="Permission matrix (role-based access control)">
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Permission</th>{Object.values(ROLES).map((r) => <th key={r.label} className="center">{r.short}</th>)}</tr></thead>
              <tbody>{perms.map(([p, roles]) => <tr key={p}><td className="mono small">{p}</td>{Object.keys(ROLES).map((r) => <td key={r} className="center">{roles.includes(r) ? '●' : ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </Card>
      </div>
      {!user && <p className="mt"><Link className="btn primary" to="/login">Sign in with a demo account →</Link></p>}
    </Page>
  );
}
