import { Link } from 'react-router-dom';
import { Page, Card, Bar, Callout, Badge } from '../components/ui';
import { useSession } from '../data/session';
import { useStore, db } from '../data/store';
import { computeTrust } from '../services/trust';

export default function Trust() {
  useStore();
  const { user } = useSession();
  const inst = db.get('institutions', user.institutionId);
  const t = computeTrust(inst);
  const tips = t.parts.filter((p) => p.tip);
  const deg = (t.score / 100) * 180;
  return (
    <Page kicker={inst.name} title="Trust score" subtitle="How much AICTE can rely on your data. It decides how early your college is picked for inspection." guide="trust">
      <div className="grid g3">
        <Card title="Your score" accent={t.band.color}>
          <svg viewBox="0 0 200 120" width="100%" style={{ maxWidth: 280 }} role="img" aria-label={`Trust score ${t.score}`}>
            <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e3d5b5" strokeWidth="20" />
            {[['#c4372a', 0, 72], ['#dc7424', 72, 108], ['#e2ac1c', 108, 144], ['#3c7a47', 144, 180]].map(([c, a, b]) => {
              const p = (d) => [100 - 80 * Math.cos((d * Math.PI) / 180), 100 - 80 * Math.sin((d * Math.PI) / 180)];
              const [x1, y1] = p(a);
              const [x2, y2] = p(b);
              return <path key={c} d={`M${x1} ${y1} A80 80 0 0 1 ${x2} ${y2}`} fill="none" stroke={c} strokeWidth="20" />;
            })}
            <line x1="100" y1="100" x2={100 - 70 * Math.cos((deg * Math.PI) / 180)} y2={100 - 70 * Math.sin((deg * Math.PI) / 180)} stroke="#2a1d15" strokeWidth="4" />
            <circle cx="100" cy="100" r="7" fill="#2a1d15" />
            <text x="100" y="92" textAnchor="middle" fontSize="0" />
          </svg>
          <div style={{ fontFamily: 'var(--display)', fontSize: 44, fontWeight: 900 }}>{t.score}<span className="muted" style={{ fontSize: 18 }}> / 100</span></div>
          <Badge color={t.band.color}>{t.band.label}</Badge>
          {t.cap && <Callout kind="bad" title="Score capped">{t.cap.why}. <Link to="/app/flags">See flags →</Link></Callout>}
        </Card>
        <Card title="Breakdown" className="span2">
          {t.parts.map((p) => (
            <div key={p.key} className="mb">
              <div className="row between"><b>{p.label}</b><span className="mono">{p.score} / {p.max}</span></div>
              <Bar thick value={p.score} max={p.max} color={p.score / p.max >= 0.8 ? 'var(--green)' : p.score / p.max >= 0.5 ? 'var(--yellow)' : 'var(--red)'} />
              <div className="small muted">{p.detail}</div>
            </div>
          ))}
        </Card>
      </div>
      <Card title="How to raise your score" className="mt" accent="orange">
        {tips.length ? <div className="pill-steps">{tips.map((p) => <div key={p.key}><span><b>{p.label}:</b> {p.tip}</span></div>)}</div> : <Callout kind="good">Your data is in great shape. Keep submitting on time.</Callout>}
        <div className="row mt"><Link className="btn" to="/app/batches">Batches</Link><Link className="btn" to="/app/flags">Flags</Link><Link className="btn" to="/app/upload">Upload</Link></div>
      </Card>
    </Page>
  );
}
