import { Page, Table, Badge } from '../../components/ui';
import { useSession } from '../../data/session';
import { useStore, db } from '../../data/store';
import { CONSENT_FIELDS } from '../../lib/constants';
import { fmtDateTime } from '../../lib/util';

export default function AccessLog() {
  useStore();
  const { user } = useSession();
  const rows = db.where('accessLog', (a) => a.apaarId === user.apaarId).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Page title="Who viewed my data" subtitle="Every view of your record by a regulator, employer or other verifier." guide="access">
      <Table rows={rows} empty="Nobody outside your college has viewed your record." columns={[
        { key: 'at', label: 'When', render: (a) => fmtDateTime(a.at) },
        { key: 'org', label: 'Who', render: (a) => <><b>{a.org}</b><div className="small muted">{a.actorName}</div></> },
        { key: 'purpose', label: 'Purpose', render: (a) => <span className="small">{a.purpose}</span> },
        { key: 'fields', label: 'What', render: (a) => <span className="small">{(a.fields || []).map((f) => CONSENT_FIELDS[f] || f).join(', ')}</span> },
        { key: 'basis', label: 'Basis', render: (a) => <Badge color={a.basis?.startsWith('Legal') ? 'teal' : 'green'}>{a.basis}</Badge> },
      ]} />
    </Page>
  );
}
