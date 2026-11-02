import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Page, Card, Callout } from '../components/ui';
import { useSession } from '../data/session';
import { useStore } from '../data/store';
import { inboxFor, markAllRead } from '../services/notify';
import { fmtDateTime } from '../lib/util';

export default function Inbox() {
  useStore();
  const { user } = useSession();
  const msgs = inboxFor(user);
  useEffect(() => {
    const t = setTimeout(() => markAllRead(user), 2500);
    return () => clearTimeout(t);
  }, [user.id]);
  const ch = { whatsapp: 'WhatsApp', sms: 'SMS', inapp: 'In-app' };
  return (
    <Page title="Inbox" subtitle="Messages the platform sent to you or your organisation." guide="inbox">
      <div className="grid g2">
        <div className="phone">
          <div className="phone-top">◉ APAAR-Setu · {user.name}</div>
          <div className="phone-body">
            {msgs.length ? msgs.map((n) => (
              <div key={n.id} className={`bubble ${n.read ? '' : 'unread'}`}>
                <div className="tiny strong">{ch[n.channel] || n.channel}{n.title ? ' · ' + n.title : ''}</div>
                {n.text}
                {n.link && <div><Link to={n.link} className="small">Open →</Link></div>}
                <time>{fmtDateTime(n.at)}</time>
              </div>
            )) : <div className="bubble">No messages yet.</div>}
          </div>
        </div>
        <Card title="About notifications">
          <Callout kind="info">In production, messages go out through the WhatsApp Business API and an SMS gateway (paid services). In this free build they are stored and shown here so every flow can be demonstrated end to end.</Callout>
          <ul className="small">
            <li><b>Institutions</b> get upload results with reason codes, flag alerts and inspection notices.</li>
            <li><b>Students</b> get verification, credential and consent-request messages.</li>
            <li><b>Regional Officers / AICTE</b> get submitted batches and late submissions.</li>
            <li><b>Verifiers</b> get consent decisions.</li>
          </ul>
        </Card>
      </div>
    </Page>
  );
}
