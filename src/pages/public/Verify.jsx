import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Page, Tabs, Card, Callout, KV } from '../../components/ui';
import { CameraScanner, decodeImageFile } from '../../components/QR';
import { verifyPresentation, CLAIM_LABELS } from '../../services/credentials';
import { AICTE_PUBLIC, fingerprint, fromB64url } from '../../lib/crypto';
import { useSession } from '../../data/session';
import { logAccess } from '../../services/consent';

export default function VerifyPage() {
  const { user } = useSession();
  const [tab, setTab] = useState('paste');
  const [code, setCode] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');

  const check = useCallback((input) => {
    setErr('');
    const r = verifyPresentation(input);
    setRes(r);
    if (r.valid && user && r.claims.apaarId) {
      logAccess({ apaarId: r.claims.apaarId, actor: user, purpose: 'Credential verification (QR presented by student)', fields: Object.keys(r.claims), basis: 'Presented by the student' });
    }
  }, [user]);

  useEffect(() => {
    const h = decodeURIComponent(window.location.hash || '');
    if (h.includes('APS1.')) {
      setCode(h.slice(h.indexOf('APS1.')));
      check(h);
    }
  }, [check]);

  const onScan = useCallback((data) => {
    setCode(data);
    check(data);
    setTab('paste');
  }, [check]);

  return (
    <Page kicker="Anyone can use this page" title="Verify a credential" subtitle="Check an APAAR-Setu certificate QR or credential link. The check uses AICTE's public key inside your browser, so it also works offline." guide="verify">
      <div className="grid g2">
        <Card title="1. Give us the code">
          <Tabs value={tab} onChange={setTab} tabs={[['paste', 'Paste link / code'], ['camera', 'Scan with camera'], ['photo', 'Upload photo']]} />
          {tab === 'paste' && (
            <form onSubmit={(e) => { e.preventDefault(); check(code); }} className="col">
              <textarea className="input" rows={5} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the verification link or the APS1.… code" aria-label="Credential code" />
              <button className="btn primary" disabled={!code.trim()}>Verify</button>
            </form>
          )}
          {tab === 'camera' && <CameraScanner onResult={onScan} />}
          {tab === 'photo' && (
            <div className="col">
              <input type="file" accept="image/*" className="input" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  onScan(await decodeImageFile(f));
                } catch (x) {
                  setErr(x.message);
                }
              }} />
              <div className="small muted">A clear photo or screenshot of the QR on the certificate.</div>
            </div>
          )}
          {err && <div className="callout bad mt">{err}</div>}
          <hr />
          <div className="small muted">
            AICTE issuer key fingerprint: <span className="mono">{fingerprint(fromB64url(AICTE_PUBLIC))}</span>
          </div>
        </Card>
        <Card title="2. Result">
          {!res && <div className="empty">The result appears here. Nothing is uploaded to any server.</div>}
          {res && res.error && <div className="verdict no"><span className="big">✕</span><div><div className="big">Cannot read</div>{res.error}</div></div>}
          {res && !res.error && (
            <>
              <div className={`verdict ${res.valid ? 'ok' : 'no'}`}>
                <span className="big">{res.valid ? '✓' : '✕'}</span>
                <div>
                  <div className="big">{res.valid ? 'Genuine' : res.revoked ? 'Revoked' : 'Not genuine'}</div>
                  {res.valid ? 'Signed by AICTE and unchanged.' : res.revoked ? 'AICTE revoked this credential.' : !res.sigOk ? 'The signature does not match AICTE’s key.' : `These details were altered: ${res.tampered.join(', ')}`}
                </div>
              </div>
              <div className="mt">
                <KV items={[
                  ['Type', res.type],
                  ['Issued on', res.issuedOn],
                  ['Issuer', <span className="mono small" key="i">{res.issuer}</span>],
                  ['Credential ID', <span className="mono small" key="c">{res.id}</span>],
                  ...Object.entries(res.claims).map(([k, v]) => [CLAIM_LABELS[k] || k, <b key={k}>{v}</b>]),
                ]} />
              </div>
              {res.hiddenCount > 0 && <Callout kind="info" title="Selective disclosure">{res.hiddenCount} other detail(s) are part of the signed credential but the student chose not to share them.</Callout>}
              {user?.role === 'verifier' && res.valid && <Link className="btn sun mt" to={`/app/requests?apaar=${res.claims.apaarId || ''}`}>Need more details? Ask the student for consent →</Link>}
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
