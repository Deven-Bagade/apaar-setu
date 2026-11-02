import { useState } from 'react';
import { Page, Card, Badge, Table, Callout, toast } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { ENDPOINTS, call, openApiSpec } from '../services/api';
import { can } from '../lib/constants';
import { buildRegistry } from '../data/mockAbc';
import { downloadFile } from '../lib/util';
import { sha } from '../lib/crypto';

const M = { GET: 'green', POST: 'orange', PATCH: 'yellow' };

export default function ApiSandbox() {
  useStore();
  const { user } = useSession();
  const [ep, setEp] = useState(ENDPOINTS[0]);
  const init = (e) => {
    const s = e.sample(user) || {};
    let path = e.p;
    Object.entries(s.path || {}).forEach(([k, v]) => (path = path.replace(`{${k}}`, v)));
    return { path, body: s.body ? JSON.stringify(s.body, null, 2) : '' };
  };
  const [req, setReq] = useState(() => init(ENDPOINTS[0]));
  const [res, setRes] = useState(null);
  const pick = (e) => {
    setEp(e);
    setReq(init(e));
    setRes(null);
  };
  const send = () => {
    let body;
    try {
      body = req.body ? JSON.parse(req.body) : undefined;
    } catch {
      return toast('Body is not valid JSON', 'bad');
    }
    setRes(call(user, ep.m, req.path.trim(), body));
  };
  const used = new Set(db.all('enrolments').map((e) => e.apaarId));
  const free = buildRegistry().list.filter((p) => !used.has(p.apaarId)).slice(0, 60).map((p) => ({ id: p.apaarId, ...p }));
  const key = 'aps_live_' + sha(user.id + 'api').slice(0, 24);
  return (
    <Page title="API sandbox" subtitle="Every action in the UI is also an API call, so college ERPs and other AICTE systems can integrate. Requests here run with your role’s permissions." guide="api"
      actions={<button className="btn" onClick={() => downloadFile('apaar-setu-openapi.json', JSON.stringify(openApiSpec(), null, 2), 'application/json')}>⬇ OpenAPI 3 spec</button>}>
      <Callout kind="info">Your demo API key: <span className="mono">{key}</span>. In production keys are OAuth 2.0 client credentials issued per institution, with IP allow-listing and rate limits.</Callout>
      <div className="grid g3">
        <Card title="Endpoints">
          {ENDPOINTS.map((e) => {
            const allowed = e.roles === 'any' || can(user, e.roles);
            return (
              <button key={e.m + e.p} className="role-card" style={{ width: '100%', marginBottom: 6, background: ep === e ? 'var(--yellow)' : undefined, opacity: allowed ? 1 : 0.55 }} onClick={() => pick(e)}>
                <span className="row"><Badge color={M[e.m]}>{e.m}</Badge><span className="mono small">{e.p}</span></span>
                <span className="small" style={{ color: 'var(--ink-2)' }}>{e.d}{!allowed && ' (not allowed for your role)'}</span>
              </button>
            );
          })}
        </Card>
        <div className="span2 col" style={{ gap: 16 }}>
          <Card title="Request">
            <div className="row">
              <Badge color={M[ep.m]}>{ep.m}</Badge>
              <input className="input mono" style={{ flex: 1 }} value={req.path} onChange={(e) => setReq({ ...req, path: e.target.value })} aria-label="Path" />
              <button className="btn primary" onClick={send}>Send ▶</button>
            </div>
            <div className="small muted mt-s">Authorization: Bearer {key.slice(0, 14)}… · Content-Type: application/json</div>
            {['POST', 'PATCH'].includes(ep.m) && <textarea className="input mt-s" rows={10} value={req.body} onChange={(e) => setReq({ ...req, body: e.target.value })} aria-label="Body" />}
          </Card>
          <Card title="Response" sub={res ? `${res.ms} ms` : ''}>
            {!res ? <div className="empty">Send a request to see the response.</div> : (
              <>
                <Badge color={res.status < 300 ? 'green' : res.status < 500 ? 'orange' : 'red'}>{res.status}</Badge>
                <pre className="hash mt-s" style={{ background: 'var(--cream)', padding: 10, border: '1.5px solid var(--ink)', maxHeight: 380, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(res.data, null, 2)}</pre>
              </>
            )}
          </Card>
          <Card title="Mock ABC registry: APAAR IDs you can test with" sub="Not enrolled anywhere yet. Use them in POST /api/v1/enrolments or the upload form.">
            <Table rows={free} pageSize={6} search="Search…" searchKeys={['name', 'apaarId']} columns={[
              { key: 'apaarId', label: 'APAAR ID', render: (r) => <span className="mono">{r.apaarId}</span> },
              { key: 'name', label: 'Name' },
              { key: 'dob', label: 'DOB' },
              { key: 'gender', label: 'G' },
              { key: 'nationality', label: 'Nationality' },
            ]} />
          </Card>
        </div>
      </div>
    </Page>
  );
}
