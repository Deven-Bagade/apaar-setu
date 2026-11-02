import { Link } from 'react-router-dom';
import { PublicNav } from '../../components/PublicFrame';
import Chatbot from '../../components/Chatbot';
import { publicList } from '../../services/publicStats';
import { useStore } from '../../data/store';
import { useSession } from '../../data/session';
import { ROLES } from '../../lib/constants';
import { Stat } from '../../components/ui';

const FLOW = [
  ['Institution', 'Admission office collects APAAR IDs'],
  ['Upload', 'Web form, Excel or ERP API'],
  ['APAAR check', 'Matched with ABC registry'],
  ['Seat Ledger', 'Must occupy an approved seat'],
  ['AICTE repository', 'Signed batch, hash-chained log'],
  ['Analytics', 'Radar, trust score, dashboards'],
  ['Verification', 'Signed QR, consent-based API'],
];
const USPS = [
  ['Seat Ledger', 'Approved intake becomes numbered seat slots. Admission number 61 of 60 is blocked at upload, not discovered a year later.', 'red'],
  ['Ghost Student Radar', 'Cross-college graph finds the same student in two colleges, look-alike identities and one phone shared by many "students".', 'orange'],
  ['Offline QR verification', 'AICTE-signed credentials. Scan a certificate in airplane mode and know if it is genuine.', 'yellow'],
  ['Selective disclosure', 'The student shares only the fields they choose; the rest stay hidden but provably signed.', 'green'],
  ['Trust Score', 'Every college gets a 0–100 data trust score that drives risk-based inspection.', 'red'],
  ['Scholarship cross-check', 'Scholarship claims are matched to real, occupied seats before money is released.', 'orange'],
  ['Consent ledger', 'Students see who viewed their data and can revoke employer access any time.', 'yellow'],
  ['Tamper-evident audit', 'Hash-chained log with daily Merkle roots: any back-dated edit is provable.', 'green'],
];

export default function Landing() {
  useStore();
  const { user } = useSession();
  const stats = publicList();
  const seats = stats.reduce((s, x) => s + x.approvedIntake, 0);
  const enrolled = stats.reduce((s, x) => s + x.enrolled, 0);
  return (
    <div className="landing">
      <PublicNav />
      <section className="hero">
        <div>
          <div className="kicker">SIH26263 · AICTE · Ministry of Education&apos;s Innovation Cell</div>
          <h1>Every seat accounted for. <em>Every student</em> verifiable.</h1>
          <p className="lead mt">APAAR-Setu turns AICTE&apos;s yearly headcount into a live, fraud-resistant seat ledger. Each admitted student is one verified APAAR ID, every seat is accounted for, and any record can be verified in seconds by anyone the student consents to.</p>
          <div className="row mt">
            <Link className="btn primary lg" to={user ? '/app' : '/login'}>{user ? 'Open my dashboard →' : 'Sign in to the platform →'}</Link>
            <Link className="btn lg" to="/verify">Verify a certificate</Link>
            <Link className="btn lg sun" to="/transparency">See college data</Link>
          </div>
        </div>
        <div className="grid g2">
          <Stat label="Institutions" value={stats.length} hint="AICTE-approved (demo set)" color="red" />
          <Stat label="Approved seats" value={seats.toLocaleString('en-IN')} hint="Within intake" color="orange" />
          <Stat label="Students on ledger" value={enrolled.toLocaleString('en-IN')} hint="Current academic year" color="yellow" />
          <Stat label="Verification" value="2 sec" hint="QR, works offline" color="green" />
        </div>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <p className="muted">The flow AICTE asked for, with one addition: nothing reaches AICTE unless it holds an approved seat.</p>
        <div className="flow mt">
          {FLOW.map(([a, b], i) => <div key={a}><span className="n">0{i + 1}</span><b>{a}</b>{b}</div>)}
        </div>
      </section>

      <section className="section">
        <h2>What makes it different</h2>
        <div className="grid g4 mt">
          {USPS.map(([h, d, c]) => (
            <div className="feature" key={h}>
              <span className="tag" style={{ background: `var(--${c})`, color: c === 'yellow' ? 'var(--ink)' : '#fff' }}>USP</span>
              <h3>{h}</h3>
              <p className="small" style={{ margin: 0 }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>One platform, six roles</h2>
        <div className="grid g3 mt">
          {Object.values(ROLES).map((r) => (
            <div className="card flat" key={r.label}>
              <span className={`badge ${r.color}`}>{r.short}</span>
              <h3 className="mt-s">{r.label}</h3>
              <p className="small" style={{ margin: 0 }}>{r.desc}</p>
            </div>
          ))}
        </div>
        <div className="row mt">
          <Link className="btn primary" to="/login">Try any role with a demo account →</Link>
          <Link className="btn" to="/help">Read the user guide</Link>
        </div>
      </section>
      <footer className="footer">
        APAAR-Setu · Built for Smart India Hackathon (PS SIH26263). Demo data is synthetic; the ABC/APAAR registry is mocked with the same API contract. ·{' '}
        <Link to="/help">Help</Link> · <Link to="/transparency">Transparency</Link>
      </footer>
      <Chatbot />
    </div>
  );
}
