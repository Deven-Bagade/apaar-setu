import { Link } from 'react-router-dom';
import { Page, Card, KV, Callout, Badge } from '../../components/ui';
import { useSession } from '../../data/session';
import { useStore, db } from '../../data/store';
import { CATEGORIES } from '../../lib/constants';
import { fmtDate } from '../../lib/util';
import { RecordStepper, StatusBadge } from '../Students';
import { effectiveStatus } from '../../services/consent';

export default function Me() {
  useStore();
  const { user } = useSession();
  const mine = db.where('enrolments', (e) => e.apaarId === user.apaarId).sort((a, b) => b.academicYear - a.academicYear);
  const pending = db.where('consents', (c) => c.apaarId === user.apaarId && effectiveStatus(c) === 'pending');
  const creds = db.where('credentials', (c) => c.apaarId === user.apaarId && !c.revoked);
  return (
    <Page kicker={`APAAR ${user.apaarId}`} title="My record" subtitle={`Namaste ${user.name.split(' ')[0]}. This is your admission record exactly as AICTE sees it.`} guide="me">
      {pending.length > 0 && <Callout kind="warn" title={`${pending.length} consent request(s) waiting`}><Link to="/app/consent">Review now →</Link></Callout>}
      {!mine.length && <Callout kind="info">No admission record yet. Your college uploads it after admission.</Callout>}
      {mine.map((e) => {
        const inst = db.get('institutions', e.institutionId);
        return (
          <Card key={e.id} title={`${e.course}`} sub={`${inst.name}, ${inst.city}`} className="mb" accent={e.recordState === 'aicte_verified' ? 'green' : e.recordState === 'on_hold' ? 'red' : 'yellow'}>
            <RecordStepper e={e} />
            <div className="grid g2 mt">
              <KV items={[
                ['Status', <StatusBadge s={e.status} key="s" />],
                ['Seat', <span className="mono" key="l">{e.slotLabel}</span>],
                ['Category', CATEGORIES[e.category].label],
                ['Admitted on', fmtDate(e.admissionDate)],
                ['Semester', e.semester],
                ['College roll no.', e.instStudentId],
              ]} />
              <KV items={[
                ['Name (as in APAAR)', e.name],
                ['Date of birth', e.dob],
                ['Guardian', e.guardian],
                ['Academic year', `${e.academicYear}-${String(e.academicYear + 1).slice(2)}`],
                ['Verified by AICTE', e.verifiedAt ? fmtDate(e.verifiedAt) : e.recordState === 'aicte_verified' ? 'Yes' : 'Not yet'],
              ]} />
            </div>
            {e.recordState === 'on_hold' && <Callout kind="bad" title="Your admission is on hold">Your APAAR ID is also active at another college. Contact both colleges so one admission is withdrawn.</Callout>}
          </Card>
        );
      })}
      <div className="grid g3">
        <Card title="My credentials" accent="green"><p className="small">{creds.length} AICTE-signed credential(s). Share them as a QR, choosing what to reveal.</p><Link className="btn go" to="/app/credentials">Open</Link></Card>
        <Card title="Consent" accent="orange"><p className="small">Allow or deny requests from employers and others.</p><Link className="btn warn" to="/app/consent">Open</Link></Card>
        <Card title="Who viewed my data" accent="yellow"><p className="small">Every access to your record, with purpose.</p><Link className="btn sun" to="/app/access">Open</Link></Card>
      </div>
      <p className="small muted mt">Something wrong? Ask your college office to correct it. Corrections are re-checked with ABC and logged. <Badge color="grey">DPDP Act 2023</Badge></p>
    </Page>
  );
}
