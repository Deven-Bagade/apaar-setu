// First-run setup for a fresh Firebase project.
import { useState } from 'react';
import { setupFirebase } from '../../data/session';
import { Card, Stripes, BrandMark, Callout } from '../../components/ui';
import { DEMO_PASSWORD } from '../../lib/constants';

export default function Setup() {
  const [size, setSize] = useState('lite');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true);
    setErr('');
    try {
      await setupFirebase(size, (m) => setLog((l) => [...l, m]));
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };
  return (
    <div className="landing">
      <Stripes />
      <div className="content" style={{ margin: '0 auto', maxWidth: 760 }}>
        <div className="row mb"><BrandMark /><h1 style={{ margin: 0 }}>Set up your Firebase project</h1></div>
        <Card>
          <p>Your Firebase project is connected but empty. This one-time step creates the demo sign-in accounts (password <code>{DEMO_PASSWORD}</code>) and writes the synthetic dataset to Firestore.</p>
          <Callout kind="warn" title="Free Spark plan limits">Firestore free tier allows 20,000 writes and 50,000 reads per day. The <b>Lite</b> dataset (8 colleges, about 2,800 writes) leaves room for the rest of the day; <b>Standard</b> (16 colleges) needs about 5,600 writes.</Callout>
          <div className="row">
            <label className="check"><input type="radio" checked={size === 'lite'} onChange={() => setSize('lite')} /> Lite (recommended)</label>
            <label className="check"><input type="radio" checked={size === 'standard'} onChange={() => setSize('standard')} /> Standard</label>
          </div>
          <button className="btn primary mt" onClick={run} disabled={busy}>{busy ? 'Working…' : 'Initialise database'}</button>
          {err && <div className="callout bad mt">{err}<br />Check that Email/Password sign-in is enabled and that firestore.rules from this project are deployed.</div>}
          {log.length > 0 && <pre className="hash mt" style={{ whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>}
        </Card>
      </div>
    </div>
  );
}
